'use client';

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

/** Confirms leaving with unfinished uploads (ui/01 section 7). */
export function LeaveDialog({
  open,
  count,
  onStay,
  onLeave,
}: {
  open: boolean;
  count: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // The guard puts focus back on the activated link.
          e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this page?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1
              ? "1 photo hasn't finished uploading. If you leave, it will be cancelled. Photos already added stay."
              : `${count} photos haven't finished uploading. If you leave, they will be cancelled. Photos already added stay.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay on this page</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onLeave}
          >
            Leave and cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
