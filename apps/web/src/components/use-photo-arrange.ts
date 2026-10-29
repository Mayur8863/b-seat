'use client';

import {
  ApiError,
  getSpacePhotosListQueryKey,
  type OwnerSpacePhoto,
  type spacePhotosListResponseSuccess,
  useSpacePhotosRemove,
  useSpacePhotosReorder,
} from '@bseat/api-client';
import { toast } from '@bseat/ui/components/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeleteTarget } from '@/components/delete-photo-dialog';
import type { PhotoAction } from '@/components/photo-reorder-controls';
import { describeOwnerProblem } from '@/lib/marketplace-problems';
import type { ProblemCopy } from '@/lib/problem-copy';

type FocusRequest =
  { kind: 'button'; photoId: string; action: PhotoAction } | { kind: 'heading'; photoId: string };

interface Options {
  spaceId: string;
  items: OwnerSpacePhoto[] | undefined;
  say: (message: string) => void;
  onPageProblem: (copy: ProblemCopy) => void;
  focusAdd: () => void;
}

const STALE: ProblemCopy = {
  title: 'These photos changed',
  description: [
    'Another tab or device changed them. The list is up to date; try that change again.',
  ],
};

/** Reorder and delete of the photo list: optimistic order, announcements and focus placement. */
export function usePhotoArrange({ spaceId, items, say, onPageProblem, focusAdd }: Options) {
  const queryClient = useQueryClient();
  const key = getSpacePhotosListQueryKey(spaceId);
  const reorder = useSpacePhotosReorder();
  const remove = useSpacePhotosRemove();
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const focus = useRef<FocusRequest | null>(null);
  const busy = reorder.isPending || remove.isPending;

  const setItems = useCallback(
    (fn: (items: OwnerSpacePhoto[]) => OwnerSpacePhoto[]) => {
      queryClient.setQueryData<spacePhotosListResponseSuccess>(key, (old) =>
        old ? { ...old, data: { ...old.data, items: fn(old.data.items) } } : old,
      );
    },
    [queryClient, key],
  );

  // Place focus once the list has re-rendered. Frames later so a closing dialog cannot take it back.
  useEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    requestAnimationFrame(() => {
      const sel =
        f.kind === 'button'
          ? `[data-photo-id="${f.photoId}"][data-action="${f.action}"]`
          : `#photo-${f.photoId}-heading`;
      const el =
        document.querySelector<HTMLElement>(sel) ??
        document
          .querySelector<HTMLElement>(`[data-photo-id="${f.photoId}"]`)
          ?.closest('article')
          ?.querySelector<HTMLElement>('button');
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, [items]);

  const move = (photoId: string, action: 'earlier' | 'later' | 'cover') => {
    if (!items || busy) return;
    const from = items.findIndex((p) => p.id === photoId);
    const to = action === 'cover' ? 0 : action === 'earlier' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setItems(() => next.map((p, i) => ({ ...p, position: i + 1 })));
    // The same button follows the card; one that no longer applies falls back to the card's first.
    focus.current = { kind: 'button', photoId, action };
    reorder.mutate(
      { spaceId, data: { photoIds: next.map((p) => p.id) } },
      {
        onSuccess: ({ data }) => {
          queryClient.setQueryData<spacePhotosListResponseSuccess>(key, (old) =>
            old ? { ...old, data } : old,
          );
          say(
            `Photo moved to position ${to + 1} of ${next.length}.${to === 0 ? ' It is now the cover.' : ''}`,
          );
        },
        onError: (error) => {
          setItems(() => items);
          if (error instanceof ApiError && error.status === 409) {
            void queryClient.invalidateQueries({ queryKey: key });
            onPageProblem(STALE);
            return;
          }
          onPageProblem(describeOwnerProblem(error, 'move that photo'));
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!target || !items) return;
    const index = items.findIndex((p) => p.id === target.id);
    const neighbour = items[index + 1] ?? items[index - 1];
    remove.mutate(
      { spaceId, photoId: target.id },
      {
        onSuccess: () => {
          const left = items.length - 1;
          setTarget(null);
          toast.success('Photo deleted');
          say(
            left === 0 ? 'Photo deleted. No photos left.' : `Photo deleted. ${left} of 10 photos.`,
          );
          if (neighbour) focus.current = { kind: 'heading', photoId: neighbour.id };
          else requestAnimationFrame(focusAdd);
          setItems((all) =>
            all.filter((p) => p.id !== target.id).map((p, i) => ({ ...p, position: i + 1 })),
          );
          void queryClient.invalidateQueries({ queryKey: key });
        },
        onError: (error) => {
          setTarget(null);
          if (error instanceof ApiError && error.status === 404) {
            void queryClient.invalidateQueries({ queryKey: key });
            onPageProblem({
              title: 'That photo was already deleted',
              description: ['The list is up to date.'],
            });
            return;
          }
          onPageProblem(describeOwnerProblem(error, 'delete that photo'));
        },
      },
    );
  };

  const dismissDelete = () => {
    const id = target?.id;
    setTarget(null);
    if (id)
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-photo-id="${id}"][data-action="delete"]`)
          ?.focus();
      });
  };

  const onAction = (photoId: string, index: number, action: PhotoAction) => {
    if (action === 'delete') {
      setTarget({ id: photoId, position: index + 1, total: items?.length ?? 0 });
      return;
    }
    move(photoId, action);
  };

  return { busy, onAction, target, deleting: remove.isPending, confirmDelete, dismissDelete };
}
