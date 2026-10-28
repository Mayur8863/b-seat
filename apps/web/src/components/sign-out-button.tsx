'use client';

import { Button } from '@bseat/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);

  const signOut = async () => {
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setFailed(true);
        return;
      }
    } catch {
      setFailed(true);
      return;
    }
    queryClient.clear();
    router.push('/sign-in');
  };

  return (
    <>
      <Button variant="outline" className={className} onClick={() => void signOut()}>
        Sign out
      </Button>
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          We couldn&apos;t sign you out. Try again.
        </p>
      ) : null}
    </>
  );
}
