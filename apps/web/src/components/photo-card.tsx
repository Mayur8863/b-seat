'use client';

import type { OwnerSpacePhoto } from '@bseat/api-client';
import { Badge } from '@bseat/ui/components/badge';
import { Card } from '@bseat/ui/components/card';

import { PhotoDescriptionForm } from '@/components/photo-description-form';
import type { ProblemCopy } from '@/lib/problem-copy';

interface Props {
  spaceId: string;
  spaceName?: string;
  photo: OwnerSpacePhoto;
  index: number;
  total: number;
  onImageError: () => void;
  onSaved: (position: number) => void;
  onPageProblem: (copy: ProblemCopy) => void;
}

/** One photo in "Your photos" (ui/01 5.1). */
export function PhotoCard({
  spaceId,
  spaceName,
  photo,
  index,
  total,
  onImageError,
  onSaved,
  onPageProblem,
}: Props) {
  return (
    <Card className="p-3">
      <article aria-labelledby={`photo-${photo.id}-heading`} className="grid gap-3">
        {/* Signed storage URL; next/image would need a remote pattern per bucket. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.card.url}
          alt={photo.altText}
          width={photo.card.width}
          height={photo.card.height}
          className="bg-muted aspect-[4/3] w-full rounded-lg object-cover"
          onError={onImageError}
        />
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id={`photo-${photo.id}-heading`}
            tabIndex={-1}
            className="font-medium focus:outline-none"
          >
            Photo {index + 1}
          </h3>
          {index === 0 && <Badge>Cover</Badge>}
          <span className="text-muted-foreground text-sm">
            {index + 1} of {total}
          </span>
        </div>
        <PhotoDescriptionForm
          spaceId={spaceId}
          spaceName={spaceName}
          photo={photo}
          onSaved={() => {
            onSaved(index + 1);
          }}
          onPageProblem={onPageProblem}
        />
      </article>
    </Card>
  );
}
