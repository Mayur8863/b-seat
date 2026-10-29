'use client';

import type { ListingPhoto } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@bseat/ui/components/dialog';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, Loader2Icon, XIcon } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';

const SWIPE_MIN = 50;
const SWIPE_RATIO = 1.5;

function LightboxImage({
  photo,
  onRefresh,
}: {
  photo: ListingPhoto;
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const retried = useRef(false);
  const { url, width, height } = photo.display;

  const retry = () => {
    setStatus('loading');
    void onRefresh().then(() => {
      setAttempt((a) => a + 1);
    });
  };

  return (
    <div
      className="relative mx-auto flex max-h-full max-w-full items-center justify-center"
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${width}px)` }}
    >
      {status === 'failed' ? (
        <div className="bg-muted text-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm">
          <ImageOffIcon aria-hidden="true" className="size-8" />
          <p>We couldn&apos;t load this photo.</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {status === 'loading' && (
            <div className="absolute inset-0">
              <Skeleton className="size-full rounded-none" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2Icon aria-hidden="true" className="size-6 motion-safe:animate-spin" />
                <span className="sr-only">Loading photo</span>
              </div>
            </div>
          )}
          <Image
            key={`${photo.id}-${attempt}`}
            src={url}
            alt={photo.altText}
            width={width}
            height={height}
            unoptimized
            className="motion-safe:animate-in motion-safe:fade-in size-full object-contain duration-150"
            onLoad={() => {
              retried.current = false;
              setStatus('loaded');
            }}
            onError={() => {
              if (retried.current) {
                setStatus('failed');
                return;
              }
              retried.current = true;
              retry();
            }}
          />
        </>
      )}
    </div>
  );
}

interface Props {
  spaceName: string;
  photos: ListingPhoto[];
  /** Id of the photo showing, or null when closed. */
  currentId: string | null;
  onChange: (id: string) => void;
  /** Called with the id showing at close, so the opener can focus its tile. */
  onClose: (id: string) => void;
  onRefresh: () => Promise<void>;
}

/** Large view of one photo (ui/02 section 4): wraps at both ends, keyboard, buttons and swipe. */
export function PhotoLightbox({
  spaceName,
  photos,
  currentId,
  onChange,
  onClose,
  onRefresh,
}: Props) {
  const total = photos.length;
  const found = photos.findIndex((p) => p.id === currentId);
  // After a refresh drops the open photo, stay at the nearest remaining place.
  const [lastIndex, setLastIndex] = useState(0);
  const index = found >= 0 ? found : Math.min(lastIndex, total - 1);
  const photo = photos[index];
  if (found >= 0 && found !== lastIndex) setLastIndex(found);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  if (currentId === null || !photo) return null;

  const go = (to: number) => {
    const next = photos[(to + total) % total];
    if (next) onChange(next.id);
  };
  const many = total > 1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!many) return;
    const moves: Record<string, () => void> = {
      ArrowRight: () => {
        go(index + 1);
      },
      ArrowLeft: () => {
        go(index - 1);
      },
      Home: () => {
        go(0);
      },
      End: () => {
        go(total - 1);
      },
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      move();
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose(photo.id);
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        onCloseAutoFocus={(e) => {
          // The opener decides where focus goes: the tile of the photo showing now.
          e.preventDefault();
        }}
        className="inset-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[90dvh] sm:w-[min(95vw,64rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border"
      >
        <div className="flex items-center gap-3 p-3">
          <DialogTitle className="text-sm font-medium break-words">{spaceName} photos</DialogTitle>
          <span aria-hidden="true" className="text-muted-foreground ml-auto text-sm">
            {index + 1} of {total}
          </span>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="size-11"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[1fr_auto_auto] gap-2 px-3 pb-3 sm:grid-cols-[auto_1fr_auto] sm:grid-rows-[1fr_auto]">
          {many && (
            <Button
              type="button"
              variant="secondary"
              aria-label="Previous photo"
              className="order-3 h-11 sm:order-none sm:col-start-1 sm:row-start-1 sm:size-11 sm:self-center sm:p-0"
              onClick={() => {
                go(index - 1);
              }}
            >
              <ChevronLeftIcon aria-hidden="true" className="hidden sm:block" />
              <span className="sm:hidden" aria-hidden="true">
                Previous
              </span>
            </Button>
          )}
          <div
            data-testid="photo-stage"
            className="bg-muted order-1 col-span-2 flex min-h-0 touch-pan-y items-center justify-center overflow-hidden sm:order-none sm:col-span-1 sm:col-start-2 sm:row-start-1"
            onPointerDown={(e) => {
              swipeStart.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const start = swipeStart.current;
              swipeStart.current = null;
              if (!start || !many) return;
              const dx = e.clientX - start.x;
              const dy = Math.abs(e.clientY - start.y);
              if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) >= SWIPE_RATIO * dy) {
                go(dx < 0 ? index + 1 : index - 1);
              }
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
          >
            <LightboxImage key={photo.id} photo={photo} onRefresh={onRefresh} />
          </div>
          {many && (
            <Button
              type="button"
              variant="secondary"
              aria-label="Next photo"
              className="order-4 h-11 sm:order-none sm:col-start-3 sm:row-start-1 sm:size-11 sm:self-center sm:p-0"
              onClick={() => {
                go(index + 1);
              }}
            >
              <ChevronRightIcon aria-hidden="true" className="hidden sm:block" />
              <span className="sm:hidden" aria-hidden="true">
                Next
              </span>
            </Button>
          )}
          {photo.description && (
            <p className="text-foreground order-2 col-span-2 text-center text-sm break-words sm:order-none sm:col-span-3 sm:row-start-2">
              {photo.description}
            </p>
          )}
        </div>
        <DialogDescription className="sr-only">
          Use the left and right arrow keys to change photo. Press Escape to close.
        </DialogDescription>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          Photo {index + 1} of {total}: {photo.altText}
        </p>
      </DialogContent>
    </Dialog>
  );
}
