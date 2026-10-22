'use client';

import { Button } from '@bseat/ui/components/button';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return (
    <Button
      variant="outline"
      onClick={() =>
        void authClient.signOut().then(() => {
          queryClient.clear();
          router.push('/sign-in');
        })
      }
    >
      Sign out
    </Button>
  );
}
