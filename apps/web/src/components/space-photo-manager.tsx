'use client';

import {
  ApiError,
  getSpacePhotosListQueryKey,
  uploadSpacePhoto,
  useOwnerSpacesGet,
  useSpacePhotosList,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { ImageIcon, ImagePlusIcon, InfoIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DeletePhotoDialog } from '@/components/delete-photo-dialog';
import { LeaveDialog } from '@/components/leave-dialog';
import { PhotoCard } from '@/components/photo-card';
import { PhotoUploadQueue } from '@/components/photo-upload-queue';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { usePhotoArrange } from '@/components/use-photo-arrange';
import type { ProblemCopy } from '@/lib/problem-copy';
import { uploadProblem } from '@/lib/photo-upload/problem';
import {
  announce,
  hasUnfinishedUploads,
  initialQueue,
  nextToStart,
  PHOTO_LIMIT,
  type QueueAction,
  queueReducer,
  room,
} from '@/lib/photo-upload/queue';

const RULES = 'JPEG, PNG or WebP, up to 10 MB each. The longest side must be at least 800 pixels.';
const FLUSH_MS = 500;

/** One polite live region: text is replaced, at most once per 500 ms, and bursts are joined. */
function useAnnouncer() {
  const [text, setText] = useState('');
  const pending = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(0);
  const say = useCallback((message: string) => {
    pending.current.push(message);
    if (timer.current) return;
    const wait = Math.max(0, last.current + FLUSH_MS - Date.now());
    timer.current = setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      setText(pending.current.join(' '));
      pending.current = [];
    }, wait);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { text, say };
}

export function SpacePhotoManager({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const space = useOwnerSpacesGet(spaceId).data?.data;
  const list = useSpacePhotosList(spaceId);
  const photos = list.data?.data;
  const count = photos?.items.length ?? 0;

  const { text: liveText, say } = useAnnouncer();
  const [state, setState] = useState(initialQueue);
  const stateRef = useRef(initialQueue);
  const files = useRef(new Map<number, File>());
  const running = useRef(new Map<number, AbortController>());
  const addButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sessionAlert = useRef<HTMLDivElement>(null);
  const [pageAlert, setPageAlert] = useState<ProblemCopy | null>(null);
  const pageAlertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pageAlert) pageAlertRef.current?.focus();
  }, [pageAlert]);

  const dispatch = useCallback(
    (action: QueueAction) => {
      const prev = stateRef.current;
      const next = queueReducer(prev, action);
      if (next === prev) return;
      stateRef.current = next;
      setState(next);
      const message = announce(prev, next, action);
      if (message) say(message);
    },
    [say],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getSpacePhotosListQueryKey(spaceId) });
  }, [queryClient, spaceId]);

  // Start waiting rows within the concurrency cap; `running` guards against a double start.
  useEffect(() => {
    for (const id of nextToStart(state)) {
      const file = files.current.get(id);
      if (!file || running.current.has(id)) continue;
      const controller = new AbortController();
      running.current.set(id, controller);
      dispatch({ type: 'start', id });
      uploadSpacePhoto(spaceId, file, {
        signal: controller.signal,
        onProgress: (fraction) => {
          dispatch({ type: 'progress', id, percent: fraction * 100 });
        },
        onProcessing: () => {
          dispatch({ type: 'processing', id });
        },
      })
        .then(() => {
          dispatch({ type: 'added', id });
          invalidate();
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          const problem = uploadProblem(error);
          dispatch({ type: 'failed', id, problem });
          // The server won a race for the last slot: the list is stale.
          if (problem === 'photo:limit-reached') invalidate();
        })
        .finally(() => {
          // The file stays in `files` so a failed row can be retried.
          running.current.delete(id);
        });
    }
  }, [state, spaceId, dispatch, invalidate]);

  // Cancel clears the abort controller; the reducer already marked the row cancelled.
  useEffect(() => {
    for (const item of state.items) {
      if (item.status.kind === 'cancelled') running.current.get(item.id)?.abort();
    }
  }, [state]);

  useEffect(
    () => () => {
      for (const c of running.current.values()) c.abort();
    },
    [],
  );

  // Refresh signed addresses two minutes before they expire (never sooner than 5 s).
  const expiresAt = photos?.photoUrlsExpireAt;
  const { refetch } = list;
  useEffect(() => {
    if (!expiresAt) return;
    const wait = Math.max(5000, Date.parse(expiresAt) - 120_000 - Date.now());
    const t = setTimeout(() => void refetch(), wait);
    return () => {
      clearTimeout(t);
    };
  }, [expiresAt, refetch]);
  const refetchedOnError = useRef(false);

  const sessionEnded = state.items.some(
    (i) => i.status.kind === 'failed' && i.status.problem === 'http-401',
  );
  useEffect(() => {
    if (sessionEnded) sessionAlert.current?.focus();
  }, [sessionEnded]);

  const unfinished = state.items.filter((i) =>
    ['waiting', 'uploading', 'processing'].includes(i.status.kind),
  ).length;
  const arrange = usePhotoArrange({
    spaceId,
    items: photos?.items,
    say,
    onPageProblem: setPageAlert,
    focusAdd: () => addButton.current?.focus(),
  });
  const guard = useLeaveGuard(hasUnfinishedUploads(state));

  const free = room(state, count);
  const atLimit = count >= PHOTO_LIMIT;
  const blocked = free === 0;

  const onChoose = (chosen: FileList | null) => {
    const picked = Array.from(chosen ?? []);
    if (input.current) input.current.value = '';
    const firstId = stateRef.current.nextId;
    picked.forEach((f, i) => files.current.set(firstId + i, f));
    dispatch({
      type: 'enqueue',
      files: picked.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      photoCount: count,
    });
  };

  const publishedNote =
    space?.status === 'published'
      ? 'Renters see these photos on search results and on your listing page.'
      : space
        ? "Renters can't see this space yet, so they can't see its photos either. Your photos stay saved."
        : null;

  const loaded = photos !== undefined;
  const hint = atLimit
    ? null
    : blocked
      ? 'You can add 0 more. Wait for uploads to finish or cancel one.'
      : `You can add ${free} more.`;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Photos</h1>
        {publishedNote && <p className="text-muted-foreground text-sm">{publishedNote}</p>}
      </div>

      {list.isPending ? (
        <div aria-busy="true" className="grid gap-4">
          <span role="status" className="sr-only">
            Loading photos…
          </span>
          <div aria-hidden="true" className="grid gap-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-32" />
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        loaded && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="grid gap-1">
              <p id="photo-count" className="font-medium">
                {count} of {PHOTO_LIMIT} photos
              </p>
              {hint && (
                <p id="photo-room" className="text-muted-foreground text-sm">
                  {hint}
                </p>
              )}
              <p className="text-muted-foreground text-sm">{RULES}</p>
            </div>
            <div>
              <input
                ref={input}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  onChoose(e.target.files);
                }}
              />
              <Button
                ref={addButton}
                type="button"
                aria-disabled={blocked}
                aria-describedby={atLimit ? 'photo-limit-note' : blocked ? 'photo-room' : undefined}
                className={`w-full max-sm:min-h-11 sm:w-auto ${blocked ? 'opacity-50' : ''}`}
                onClick={() => {
                  if (!blocked) input.current?.click();
                }}
              >
                <ImagePlusIcon aria-hidden="true" />
                Add photos
              </Button>
            </div>
          </div>
        )
      )}

      {atLimit && (
        <Alert role="status" id="photo-limit-note">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>This space has the maximum of 10 photos</AlertTitle>
          <AlertDescription>Delete a photo to make room for another.</AlertDescription>
        </Alert>
      )}

      {sessionEnded && (
        <Alert variant="destructive" role="alert" ref={sessionAlert} tabIndex={-1}>
          <AlertTitle>Your session has ended</AlertTitle>
          <AlertDescription>
            Sign in again to keep adding photos. Photos already added are saved.{' '}
            <Link
              href={
                `/sign-in?next=${encodeURIComponent(`/owner/spaces/${spaceId}/photos`)}` as Route
              }
              className="underline underline-offset-4"
            >
              Sign in
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {pageAlert && (
        <Alert variant="destructive" role="alert" ref={pageAlertRef} tabIndex={-1}>
          <AlertTitle>{pageAlert.title}</AlertTitle>
          <AlertDescription>
            {pageAlert.description.map((part) =>
              typeof part === 'string' ? (
                part
              ) : (
                <Link key={part.href} href={part.href} className="underline underline-offset-4">
                  {part.text}
                </Link>
              ),
            )}
          </AlertDescription>
        </Alert>
      )}

      <PhotoUploadQueue
        items={state.items}
        dispatch={(action) => {
          dispatch(action);
          if (action.type === 'clear-finished' && stateRef.current.items.length === 0)
            addButton.current?.focus();
        }}
        focusAdd={() => addButton.current?.focus()}
      />

      <section aria-labelledby="photos-heading" className="grid gap-3">
        <h2 id="photos-heading" className="text-lg font-semibold">
          Your photos
        </h2>
        {list.error && !photos ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>We couldn&apos;t load your photos</AlertTitle>
            <AlertDescription>
              {list.error instanceof ApiError && list.error.status === 401
                ? 'Your session has ended. Sign in again to see your photos.'
                : 'Try again in a moment.'}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void list.refetch()}
                >
                  Try again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : photos?.items.length === 0 ? (
          state.items.length === 0 && (
            <Card className="grid gap-1 p-4">
              <ImageIcon aria-hidden="true" className="text-muted-foreground size-6" />
              <p className="font-medium">Add photos of your space</p>
              <p className="text-muted-foreground text-sm">
                Photos help renters choose. The first photo is the cover on search results.
              </p>
              <p className="text-muted-foreground text-sm">
                JPEG, PNG or WebP, up to 10 MB each, at least 800 pixels on the longest side. Up to
                10 photos.
              </p>
            </Card>
          )
        ) : (
          photos && (
            <>
              <p className="text-muted-foreground text-sm">The first photo is the cover.</p>
              <ol aria-label="Photos in order" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {photos.items.map((photo, index) => (
                  <li key={photo.id}>
                    <PhotoCard
                      spaceId={spaceId}
                      spaceName={space?.name}
                      photo={photo}
                      index={index}
                      total={photos.items.length}
                      onImageError={() => {
                        if (refetchedOnError.current) return;
                        refetchedOnError.current = true;
                        void list.refetch();
                      }}
                      onSaved={(position) => {
                        say(`Description saved for photo ${position}.`);
                      }}
                      onPageProblem={setPageAlert}
                      busy={arrange.busy}
                      onAction={arrange.onAction}
                    />
                  </li>
                ))}
              </ol>
            </>
          )
        )}
      </section>

      <DeletePhotoDialog
        target={arrange.target}
        pending={arrange.deleting}
        onConfirm={arrange.confirmDelete}
        onDismiss={arrange.dismissDelete}
      />

      <LeaveDialog
        open={guard.pending}
        count={unfinished}
        onStay={guard.stay}
        onLeave={guard.leave}
      />

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveText}
      </div>
    </div>
  );
}
