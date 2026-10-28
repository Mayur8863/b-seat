import type { Metadata } from 'next';

import { PricingForm } from '@/components/pricing-form';

export const metadata: Metadata = { title: 'Passes and prices' };

export default async function PricingPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <PricingForm spaceId={spaceId} />;
}
