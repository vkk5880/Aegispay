import React from 'react';
import type { Metadata } from 'next';
import { PlansClientView } from '@/components/merchant/PlansClientView';

export const metadata: Metadata = { title: 'Billing Plans | Merchant Cockpit' };

export default async function PlansPage() {
  const initialPlans = [
    {
      id: 'PLAN-1',
      productId: 'PROD-1',
      name: 'Pro Monthly Plan',
      status: 'ACTIVE',
      price: 29.0,
      billedEvery: '1 MONTH',
      trial: 'None',
      setupFee: 0,
      currency: 'USD',
      created: '2026-10-15T08:30:00Z',
    },
  ];

  return <PlansClientView initialPlans={initialPlans} />;
}
