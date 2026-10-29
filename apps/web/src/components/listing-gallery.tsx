'use client';

import type { ListingPhoto } from '@bseat/api-client';
import { useRef, useState } from 'react';

import { PhotoLightbox } from '@/components/photo-lightbox';
import { SpacePhoto } from '@/components/space-photo';

interface Props {
  spaceName: string;
  photos: ListingPhoto[];
  /** Refetches the listing so photo addresses are fresh; shared by every failing image. */
  onRefresh: () => Promise<void>;
}

/** Photos on the listing page (ui/02 section 3): gallery tiles that open the large view. */
export function ListingGallery({ spaceName, photos, onRefresh }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const total = photos.length;

  const close = (id: string) => {
    setOpenId(null);
    // Wait for the dialog to unmount so Radix does not take focus back after we move it.
    setTimeout(() => {
      const tile = tiles.current.get(id);
      tile?.focus();
      tile?.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  return (
    <section aria-labelledby="gallery-heading" className="grid gap-3 lg:max-w-2xl">
      <div className="flex items-baseline gap-2">
        <h2 id="gallery-heading" className="text-lg font-medium">
          Photos
        </h2>
        {total > 0 && (
          <span className="text-muted-foreground text-sm">
            {total === 1 ? '1 photo' : `${total} photos`}
          </span>
        )}
      </div>
      {total === 0 ? (
        <SpacePhoto photo={null} variant="gallery" className="lg:max-w-xl" />
      ) : (
        <ul className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
          {photos.map((photo, n) => {
            const cover = n === 0;
            const image = cover ? photo.display : photo.card;
            return (
              <li key={photo.id} className={cover ? 'col-span-2 md:row-span-2' : undefined}>
                <figure className={`grid gap-1 ${cover && total === 1 ? 'lg:max-w-xl' : ''}`}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${photo.altText}, photo ${n + 1} of ${total}, open large view`}
                    ref={(el) => {
                      if (el) tiles.current.set(photo.id, el);
                      else tiles.current.delete(photo.id);
                    }}
                    className="focus-visible:outline-ring [&:hover>div]:ring-primary block w-full cursor-zoom-in rounded-lg outline-offset-2 focus-visible:outline-2 [&:hover>div]:ring-2"
                    onClick={() => {
                      setOpenId(photo.id);
                    }}
                  >
                    <SpacePhoto
                      variant="gallery"
                      eager={n < 3}
                      onRefresh={onRefresh}
                      photo={{ ...image, alt: photo.altText }}
                    />
                  </button>
                  {photo.description && (
                    <figcaption className="text-foreground line-clamp-2 text-sm">
                      {photo.description}
                    </figcaption>
                  )}
                </figure>
              </li>
            );
          })}
        </ul>
      )}
      <PhotoLightbox
        spaceName={spaceName}
        photos={photos}
        currentId={openId}
        onChange={setOpenId}
        onClose={close}
        onRefresh={onRefresh}
      />
    </section>
  );
}
