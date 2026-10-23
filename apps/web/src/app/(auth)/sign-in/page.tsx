'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AuthForm } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';

function SignIn() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const target = safeNext(next);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm
        mode="sign-in"
        onSubmit={async (values) => {
          const { error } = await authClient.signIn.email(values);
          if (error) return error.message ?? 'Sign in failed';
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
