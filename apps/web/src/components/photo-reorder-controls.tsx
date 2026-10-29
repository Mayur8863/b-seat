'use client';

import { Button } from '@bseat/ui/components/button';
import { ArrowLeftIcon, ArrowRightIcon, StarIcon, Trash2Icon } from 'lucide-react';

export type PhotoAction = 'earlier' | 'later' | 'cover' | 'delete';

interface Props {
  photoId: string;
  index: number;
  total: number;
  /** A reorder or delete is pending: presses are ignored but the buttons stay focusable. */
  busy: boolean;
  onAction: (action: PhotoAction) => void;
}

/** Move and delete buttons of one card (ui/01 5.3, 5.5). A button that does not apply is omitted. */
export function PhotoReorderControls({ photoId, index, total, busy, onAction }: Props) {
  const btn = (action: PhotoAction, label: string, icon: React.ReactNode) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-sm:min-h-11"
      data-photo-id={photoId}
      data-action={action}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onAction(action);
      }}
    >
      {icon}
      {label}
      <span className="sr-only"> photo {index + 1}</span>
    </Button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {total > 1 &&
        index > 0 &&
        btn('earlier', 'Move earlier', <ArrowLeftIcon aria-hidden="true" />)}
      {total > 1 &&
        index < total - 1 &&
        btn('later', 'Move later', <ArrowRightIcon aria-hidden="true" />)}
      {total > 1 && index > 0 && btn('cover', 'Make cover', <StarIcon aria-hidden="true" />)}
      {btn('delete', 'Delete', <Trash2Icon aria-hidden="true" />)}
    </div>
  );
}
