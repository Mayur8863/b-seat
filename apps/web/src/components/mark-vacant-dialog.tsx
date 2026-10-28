'use client';

import { useOccupancyEnd } from '@bseat/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@bseat/ui/components/alert-dialog';
import { buttonVariants } from '@bseat/ui/components/button';
import { toast } from '@bseat/ui/components/sonner';
import { useRef } from 'react';

import { useSeatRefresh } from '@/components/use-seat-refresh';
import { describeOccupancyProblem } from '@/lib/occupancy-problems';
import type { ProblemCopy } from '@/lib/problem-copy';

export interface EndTarget {
  markId: string;
  seatId: string;
  seatLabel: string;
  /** `vacant` ends today's mark; `remove` drops an upcoming one. */
  kind: 'vacant' | 'remove';
  range: string;
}

/** Both "Mark vacant" and "Remove" end a mark; the server treats a repeat as a no-op (ui/04 2.2). */
export function MarkVacantDialog({
  spaceId,
  target,
  onClose,
  onEnded,
  onPageProblem,
}: {
  spaceId: string;
  target: EndTarget | null;
  onClose: () => void;
  onEnded: (target: EndTarget) => void;
  onPageProblem: (copy: ProblemCopy) => void;
}) {
  const end = useOccupancyEnd();
  const refresh = useSeatRefresh(spaceId);
  const ended = useRef(false);
  const remove = target?.kind === 'remove';
  const confirm = () => {
    if (!target) return;
    end.mutate(
      { spaceId, markId: target.markId },
      {
        onSuccess: () => {
          toast.success(remove ? 'Mark removed' : `Seat ${target.seatLabel} is vacant`);
          ended.current = true;
          onEnded(target);
          refresh();
        },
        onError: (error) => {
          onClose();
          onPageProblem(
            describeOccupancyProblem(error, remove ? 'remove mark' : 'mark vacant').alert,
          );
        },
      },
    );
  };
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o && !end.isPending) onClose();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // The list effect places focus once the refreshed marks arrive.
          if (ended.current) e.preventDefault();
          ended.current = false;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {remove
              ? `Remove this mark for seat ${target.seatLabel}?`
              : `Mark seat ${target?.seatLabel} vacant?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {remove
              ? `${target.range}. The seat stays bookable on those dates.`
              : 'The mark ends today. Renters can book it from the next slot that has not started.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={end.isPending}>
            {remove ? 'Keep mark' : 'Keep occupied'}
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={end.isPending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {end.isPending ? 'Updating…' : remove ? 'Remove mark' : 'Mark vacant'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
