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

export interface DeleteTarget {
  id: string;
  position: number;
  total: number;
}

/** Permanent-delete confirmation (ui/01 5.5). The owner of `onConfirm` closes it and places focus. */
export function DeletePhotoDialog({
  target,
  pending,
  onConfirm,
  onDismiss,
}: {
  target: DeleteTarget | null;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const extra =
    target?.total === 1
      ? ' Renters will see "No photos yet" instead.'
      : target?.position === 1
        ? ' The next photo becomes the cover.'
        : '';
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onDismiss();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // Focus is placed by the caller: the Delete button on dismiss, a neighbour after a delete.
          e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
          <AlertDialogDescription>
            Photo {target?.position} will be deleted permanently. This can&apos;t be undone.
            {extra}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep photo</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? 'Deleting…' : 'Delete photo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
