'use client';

import { Button } from '@bseat/ui/components/button';
import { Progress } from '@bseat/ui/components/progress';
import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  Loader2Icon,
  type LucideIcon,
} from 'lucide-react';

import type { QueueAction, QueueItem } from '@/lib/photo-upload/queue';

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

function State({ item }: { item: QueueItem }) {
  const s = item.status;
  const line = (Icon: LucideIcon, text: string, cls = '', spin = false) => (
    <p className={`flex items-center gap-1.5 text-sm ${cls}`}>
      <Icon
        aria-hidden="true"
        className={`size-4 shrink-0 ${spin ? 'motion-safe:animate-spin' : ''}`}
      />
      {text}
    </p>
  );
  switch (s.kind) {
    case 'waiting':
      return line(ClockIcon, 'Waiting', 'text-muted-foreground');
    case 'uploading':
      return (
        <div className="grid gap-1.5">
          {line(Loader2Icon, `Uploading ${s.percent}%`, '', true)}
          <Progress
            value={s.percent}
            aria-label={`Uploading ${item.file.name}`}
            className="sm:max-w-xs"
          />
        </div>
      );
    case 'processing':
      return line(Loader2Icon, 'Processing…', '', true);
    case 'added':
      return line(CircleCheckIcon, 'Added', 'text-success');
    case 'failed':
      return line(CircleAlertIcon, `Failed: ${s.reason}`, 'text-destructive');
    case 'not-added':
      return line(BanIcon, 'Not added: this space already has 10 photos.', 'text-muted-foreground');
    case 'cancelled':
      return line(BanIcon, 'Cancelled', 'text-muted-foreground');
  }
}

interface Props {
  items: QueueItem[];
  dispatch: (action: QueueAction) => void;
  focusAdd: () => void;
}

/** The Uploads section (ui/01 section 4). Renders nothing while the queue is empty. */
export function PhotoUploadQueue({ items, dispatch, focusAdd }: Props) {
  if (items.length === 0) return null;
  const finished = items.some((i) => ['added', 'not-added', 'cancelled'].includes(i.status.kind));

  // Focus goes to the next row's first button, else the previous row's, else Add photos.
  const act = (el: HTMLElement, index: number, action: QueueAction, moveFocus: boolean) => {
    const rows = Array.from(el.closest('ul')?.querySelectorAll('li') ?? []);
    const target =
      rows[index + 1]?.querySelector('button') ?? rows[index - 1]?.querySelector('button');
    dispatch(action);
    if (!moveFocus) return;
    if (target) target.focus();
    else focusAdd();
  };

  return (
    <section aria-labelledby="uploads-heading" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="uploads-heading" className="text-lg font-semibold">
          Uploads
        </h2>
        {finished && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-sm:min-h-11"
            onClick={() => {
              dispatch({ type: 'clear-finished' });
            }}
          >
            Clear finished
          </Button>
        )}
      </div>
      <ul aria-label="Uploads" className="grid gap-2">
        {items.map((item, index) => {
          const k = item.status.kind;
          const name = <span className="sr-only">{item.file.name}</span>;
          const button = (label: string, action: QueueAction, moveFocus: boolean) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-sm:min-h-11"
              onClick={(e) => {
                act(e.currentTarget, index, action, moveFocus);
              }}
            >
              {label} {name}
            </Button>
          );
          return (
            <li
              key={item.id}
              aria-busy={k === 'processing' ? true : undefined}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto]"
            >
              <div className="grid min-w-0 gap-1">
                <p className="flex gap-2">
                  <span className="font-medium break-all sm:truncate">{item.file.name}</span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {mb(item.file.size)}
                  </span>
                </p>
                <State item={item} />
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {(k === 'waiting' || k === 'uploading') &&
                  button('Cancel', { type: 'cancel', id: item.id }, true)}
                {k === 'failed' && item.status.retryable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-sm:min-h-11"
                    onClick={(e) => {
                      const li = e.currentTarget.closest('li');
                      dispatch({ type: 'retry', id: item.id });
                      // The Retry button is replaced by Cancel; keep focus on the row.
                      requestAnimationFrame(() => li?.querySelector('button')?.focus());
                    }}
                  >
                    Retry {name}
                  </Button>
                )}
                {(k === 'failed' || k === 'not-added' || k === 'cancelled') &&
                  button('Dismiss', { type: 'dismiss', id: item.id }, true)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
