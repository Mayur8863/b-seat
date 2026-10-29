'use client';

import {
  ApiError,
  getSpacePhotosListQueryKey,
  type OwnerSpacePhoto,
  type spacePhotosListResponseSuccess,
  useSpacePhotosDescribe,
} from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { Label } from '@bseat/ui/components/label';
import { Textarea } from '@bseat/ui/components/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { describeOwnerProblem } from '@/lib/marketplace-problems';
import type { ProblemCopy } from '@/lib/problem-copy';

const schema = z.object({ description: z.string().trim().max(150, 'Use 150 characters or fewer') });
type Values = z.input<typeof schema>;

interface Props {
  spaceId: string;
  photo: OwnerSpacePhoto;
  spaceName?: string;
  onSaved: () => void;
  onPageProblem: (copy: ProblemCopy) => void;
}

/** Caption and alt text of one photo (ui/01 5.2). The draft lives in this form, not in the query data. */
export function PhotoDescriptionForm({ spaceId, photo, spaceName, onSaved, onPageProblem }: Props) {
  const queryClient = useQueryClient();
  const describe = useSpacePhotosDescribe();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { description: photo.description ?? '' },
  });
  const id = `photo-${photo.id}`;
  const error = errors.description?.message;
  const describedBy = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(' ');

  const submit = handleSubmit(({ description }) => {
    setSaved(false);
    describe.mutate(
      { spaceId, photoId: photo.id, data: { description: description.trim() } },
      {
        onSuccess: ({ data }) => {
          queryClient.setQueryData<spacePhotosListResponseSuccess>(
            getSpacePhotosListQueryKey(spaceId),
            (old) =>
              old && {
                ...old,
                data: {
                  ...old.data,
                  items: old.data.items.map((p) => (p.id === data.id ? data : p)),
                },
              },
          );
          reset({ description: data.description ?? '' });
          setSaved(true);
          onSaved();
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 400) {
            const plain = e.problem?.errors?.some((x) => /plain|control/i.test(x.message));
            setError('description', {
              message: plain ? 'Use plain text only.' : 'Check the description and try again.',
            });
            return;
          }
          onPageProblem(describeOwnerProblem(e, 'save that description'));
        },
      },
    );
  });

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-2">
      <Label htmlFor={`${id}-description`}>
        Description (optional)
        <span className="sr-only"> for photo {photo.position}</span>
      </Label>
      <Textarea
        id={`${id}-description`}
        rows={2}
        disabled={describe.isPending}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...register('description', {
          onChange: () => {
            setSaved(false);
          },
        })}
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        Shown as the caption and read aloud by screen readers. Empty uses &quot;
        {spaceName ?? 'Your space'} photo {photo.position}&quot;.
      </p>
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="max-sm:min-h-11"
          disabled={describe.isPending}
          aria-busy={describe.isPending || undefined}
        >
          {describe.isPending ? 'Saving…' : 'Save description'}
          <span className="sr-only"> for photo {photo.position}</span>
        </Button>
        {saved && (
          <p role="status" className="text-success flex items-center gap-1 text-sm">
            <CircleCheckIcon aria-hidden="true" className="size-4" />
            Description saved
          </p>
        )}
      </div>
    </form>
  );
}
