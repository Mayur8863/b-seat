'use client';

import { ImageIcon, ImageOffIcon } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';

export interface SpacePhotoData {
  url: string;
  width: number;
  height: number;
  alt: string;
}

interface Props {
  photo: SpacePhotoData | null;
  variant: 'card' | 'gallery';
  eager?: boolean;
  /** Refetches the data this photo came from; called at most once per failing image. */
  onRefresh?: () => Promise<void>;
  className?: string;
}

const FRAME = 'relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted';

/** One photo place (ui/02 section 2): image, loading, "No photos yet" or "Photo unavailable". */
export function SpacePhoto({ photo, variant, eager = false, onRefresh, className }: Props) {
  const [state, setState] = useState<{ src: string; status: 'loading' | 'loaded' | 'failed' }>({
    src: photo?.url ?? '',
    status: 'loading',
  });
  const retried = useRef(false);

  // A loaded image keeps its address so a silent refresh never swaps or flickers it.
  if (photo && state.src !== photo.url && state.status !== 'loaded') {
    setState({ src: photo.url, status: 'loading' });
  }

  if (!photo) {
    return (
      <div className={`${FRAME} ${className ?? ''}`}>
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
          <ImageIcon aria-hidden="true" className="size-8" />
          No photos yet
        </div>
      </div>
    );
  }

  const handleError = () => {
    if (retried.current || !onRefresh) {
      setState((s) => ({ ...s, status: 'failed' }));
      return;
    }
    retried.current = true;
    setState((s) => ({ ...s, status: 'loading' }));
    void onRefresh();
  };

  if (state.status === 'failed') {
    return (
      <div className={`${FRAME} ${className ?? ''}`}>
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
          <ImageOffIcon aria-hidden="true" className="size-8" />
          Photo unavailable
        </div>
      </div>
    );
  }

  return (
    <div
      data-variant={variant}
      data-loading={state.status === 'loading' ? 'true' : undefined}
      className={`${FRAME} ${state.status === 'loading' ? 'motion-safe:animate-pulse' : ''} ${className ?? ''}`}
    >
      <Image
        key={state.src}
        src={state.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        unoptimized
        loading={eager ? 'eager' : 'lazy'}
        className="size-full object-cover"
        onLoad={() => {
          retried.current = false;
          setState((s) => ({ ...s, status: 'loaded' }));
        }}
        onError={handleError}
      />
    </div>
  );
}
