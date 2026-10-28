'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { AuthForm } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';

/** Fixed strings only: Better Auth's raw message is never shown. */
function signInError(code: string | undefined): string {
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_EMAIL') {
    return 'Email or password is incorrect.';
  }
  if (code === 'EMAIL_NOT_VERIFIED') return 'Confirm your email address, then sign in.';
  return "We couldn't sign you in. Try again.";
}

function SignIn() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const target = safeNext(next);
  const session = authClient.useSession();

  // Only a server-validated session redirects; a stale cookie yields no user and the form shows.
  const hasSession = Boolean(session.data?.user);
  useEffect(() => {
    if (hasSession) router.replace(target as '/dashboard');
  }, [hasSession, router, target]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm
        mode="sign-in"
        onSubmit={async (values) => {
          const { error } = await authClient.signIn.email(values);
          if (error) return signInError(error.code);
          router.push(target as '/dashboard');
          return undefined;
        }}
      />
      <p className="text-muted-foreground text-sm">
        New here?{' '}
        <Link
          href="/sign-up"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
