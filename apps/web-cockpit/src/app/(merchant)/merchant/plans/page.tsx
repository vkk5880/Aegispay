import React from 'react';
import type { Metadata } from 'next';
import { PlansClientView } from '@/components/merchant/PlansClientView';

export const metadata: Metadata = { title: 'Billing Plans | Merchant Cockpit' };

export default async function PlansPage() {
  return <PlansClientView initialPlans={[]} />;
}
