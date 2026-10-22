'use client';

import { Alert, AlertDescription } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Use at least 12 characters'),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

type Props =
  | { mode: 'sign-in'; onSubmit: (values: SignInValues) => Promise<string | undefined> }
  | { mode: 'sign-up'; onSubmit: (values: SignUpValues) => Promise<string | undefined> };

interface FormValues {
  name?: string;
  email: string;
  password: string;
}

/**
 * Accessible email/password form. `onSubmit` resolves to an error message to
 * show, or undefined on success.
 */
export function AuthForm(props: Props) {
  const isSignUp = props.mode === 'sign-up';
  const id = useId();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isSignUp ? signUpSchema : signInSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    const error =
      props.mode === 'sign-up'
        ? await props.onSubmit({
            name: values.name ?? '',
            email: values.email,
            password: values.password,
          })
        : await props.onSubmit({ email: values.email, password: values.password });
    if (error) setFormError(error);
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
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {isSignUp && field('name', 'Name', 'text', 'name')}
      {field('email', 'Email', 'email', 'email')}
      {field('password', 'Password', 'password', isSignUp ? 'new-password' : 'current-password')}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
      </Button>
    </form>
  );
}
