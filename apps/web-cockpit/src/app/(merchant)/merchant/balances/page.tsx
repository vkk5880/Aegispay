import React from 'react';
import type { Metadata } from 'next';
import { BalancesClientView } from '@/components/merchant/BalancesClientView';

export const metadata: Metadata = { title: 'Held Balances | Merchant Cockpit' };

export default async function BalancesPage() {
  return <BalancesClientView initialBalances={[]} />;
}
