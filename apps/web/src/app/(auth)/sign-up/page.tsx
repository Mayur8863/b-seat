'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthForm } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

export default function SignUpPage() {
  const router = useRouter();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm
        mode="sign-up"
        onSubmit={async (values) => {
          // The API now requires an account type. Bridge until T015 replaces this with the user's choice.
          const { error } = await authClient.signUp.email({ ...values, accountType: 'renter' });
          if (error) return error.message ?? 'Sign up failed';
          router.push('/dashboard');
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
