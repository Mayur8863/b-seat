'use client';

import { Alert, AlertDescription } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

export const ROLE_ERROR = 'Choose whether you own a space or need one';

const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Use at least 12 characters'),
  accountType: z.enum(['owner', 'renter'], { error: ROLE_ERROR }),
});

const ROLES = [
  { value: 'owner', label: 'I own a space', hint: 'List seats and passes for renters to book.' },
  {
    value: 'renter',
    label: 'I need a space',
    hint: 'Find and book a seat by the day, week or month.',
  },
] as const;

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

/** What a sign-up attempt resolves to: nothing on success, else where to show the problem. */
export type SignUpFailure = { accountType: string } | { form: string; signInLink?: boolean };

type Props =
  | { mode: 'sign-in'; onSubmit: (values: SignInValues) => Promise<string | undefined> }
  | { mode: 'sign-up'; onSubmit: (values: SignUpValues) => Promise<SignUpFailure | undefined> };

interface FormValues {
  name?: string;
  email: string;
  password: string;
  accountType?: 'owner' | 'renter';
}

/**
 * Accessible email/password form. Sign-in `onSubmit` resolves to an error message
 * to show, or undefined on success. Sign-up `onSubmit` resolves to a `SignUpFailure`
 * (shown on the role field or as a form alert), or undefined on success.
 * All fields are disabled while a submit is in flight.
 */
export function AuthForm(props: Props) {
  const isSignUp = props.mode === 'sign-up';
  const id = useId();
  const [formError, setFormError] = useState<{ message: string; signInLink?: boolean }>();
  const {
    register,
    control,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isSignUp ? signUpSchema : signInSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    if (props.mode === 'sign-in') {
      const error = await props.onSubmit({ email: values.email, password: values.password });
      if (error) setFormError({ message: error });
      return;
    }
    if (!values.accountType) return;
    const failure = await props.onSubmit({
      name: values.name ?? '',
      email: values.email,
      password: values.password,
      accountType: values.accountType,
    });
    if (!failure) return;
    if ('accountType' in failure) {
      setError('accountType', { message: failure.accountType }, { shouldFocus: true });
    } else {
      setFormError({ message: failure.form, signInLink: failure.signInLink });
    }
  });

  const field = (name: keyof FormValues, label: string, type: string, autoComplete: string) => {
    const error = errors[name]?.message;
    const errorId = `${id}-${name}-error`;
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${id}-${name}`}>{label}</Label>
        <Input
          id={`${id}-${name}`}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...register(name)}
        />
        {error && (
          <p id={errorId} className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {formError.message}
            {formError.signInLink && (
              <>
                {' '}
                <Link href="/sign-in" className="underline underline-offset-4">
                  Sign in
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      <fieldset disabled={isSubmitting} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        {isSignUp && field('name', 'Name', 'text', 'name')}
        {field('email', 'Email', 'email', 'email')}
        {field('password', 'Password', 'password', isSignUp ? 'new-password' : 'current-password')}
        {isSignUp && (
          <fieldset className="grid gap-2" disabled={isSubmitting}>
            <legend className="mb-2 text-sm font-medium">I want to</legend>
            <Controller
              control={control}
              name="accountType"
              render={({ field: f, fieldState }) => (
                <>
                  <RadioGroup
                    name={f.name}
                    value={f.value ?? ''}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    required
                    aria-required="true"
                    aria-invalid={fieldState.error ? true : undefined}
                    aria-describedby={fieldState.error ? `${id}-accountType-error` : undefined}
                    disabled={isSubmitting}
                  >
                    {ROLES.map((role, index) => (
                      <Label
                        key={role.value}
                        htmlFor={`${id}-role-${role.value}`}
                        className="bg-card hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-primary has-data-[state=checked]:bg-primary/5 has-focus-visible:outline-ring flex min-h-16 items-start gap-3 rounded-lg border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-data-[state=checked]:ring-1"
                      >
                        <RadioGroupItem
                          ref={index === 0 ? f.ref : undefined}
                          id={`${id}-role-${role.value}`}
                          value={role.value}
                          aria-labelledby={`${id}-role-${role.value}-title`}
                          aria-describedby={`${id}-role-${role.value}-hint`}
                          className="mt-0.5"
                        />
                        <span className="grid gap-1">
                          <span id={`${id}-role-${role.value}-title`}>{role.label}</span>
                          <span
                            id={`${id}-role-${role.value}-hint`}
                            className="text-muted-foreground text-sm font-normal"
                          >
                            {role.hint}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                  {fieldState.error && (
                    <p id={`${id}-accountType-error`} className="text-destructive text-sm">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />
          </fieldset>
        )}
      </fieldset>
      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
        {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
      </Button>
    </form>
  );
}
