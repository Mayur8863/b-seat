'use client';

import { Button } from '@bseat/ui/components/button';
import { toast } from '@bseat/ui/components/sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AuthForm, ROLE_ERROR, type SignUpFailure } from '@/components/auth-form';
import { PreferencesForm } from '@/components/preferences-form';
import { authClient } from '@/lib/auth-client';

type Stage =
  | { kind: 'form' }
  | { kind: 'preferences' }
  | { kind: 'check-email'; email: string; role: 'owner' | 'renter' };

const NONE = { country: null, city: null, area: null };

/** Maps a Better Auth error code to what the form shows; raw server messages are never shown. */
function failureFor(code: string | undefined): SignUpFailure {
  if (code === 'MISSING_FIELD' || code === 'VALIDATION_ERROR') return { accountType: ROLE_ERROR };
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return { form: 'An account with this email already exists.', signInLink: true };
  }
  return { form: "We couldn't create your account. Try again." };
}

export default function SignUpPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const heading = useRef<HTMLHeadingElement>(null);
  // Set once a sign-up starts, so the session it creates is not mistaken for an existing one.
  const signingUp = useRef(false);

  // Only a server-validated session redirects; a stale cookie yields no user and the form shows.
  const hasSession = Boolean(session.data?.user);
  useEffect(() => {
    if (hasSession && !signingUp.current) router.replace('/dashboard');
  }, [hasSession, router]);

  useEffect(() => {
    if (stage.kind !== 'form') heading.current?.focus();
  }, [stage]);

  if (stage.kind === 'preferences') {
    return (
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
            Where do you want a space?
          </h1>
          <p className="text-muted-foreground text-sm">
            Optional. We use this to fill in your search. You can change it later on your dashboard.
          </p>
        </div>
        <PreferencesForm
          variant="signup"
          initial={NONE}
          onDismiss={() => {
            router.push('/dashboard');
          }}
          onSaved={(outcome) => {
            if (outcome === 'saved') toast.success('Preferences saved');
            router.push('/dashboard');
          }}
          onFailed={() => {
            toast.error(
              "Your account is ready, but we couldn't save your preferences. Add them from your dashboard.",
            );
            router.push('/dashboard');
          }}
        />
      </div>
    );
  }

  if (stage.kind === 'check-email') {
    return (
      <div className="grid gap-4">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Check your email
        </h1>
        <p>We sent a link to {stage.email}. Open it to confirm your account, then sign in.</p>
        {stage.role === 'renter' && (
          <p className="text-muted-foreground text-sm">
            After you sign in, you can add your preferred location from your dashboard.
          </p>
        )}
        <Button asChild>
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm
        mode="sign-up"
        onSubmit={async (values) => {
          signingUp.current = true;
          const { data, error } = await authClient.signUp.email(values);
          if (error) {
            signingUp.current = false;
            return failureFor(error.code);
          }
          if (!data.token) {
            setStage({ kind: 'check-email', email: values.email, role: values.accountType });
          } else if (values.accountType === 'renter') {
            setStage({ kind: 'preferences' });
          } else {
            router.push('/dashboard');
          }
          return undefined;
        }}
      />
      <p className="text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
