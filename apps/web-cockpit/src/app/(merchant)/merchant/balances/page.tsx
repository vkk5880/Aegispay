import React from 'react';
import type { Metadata } from 'next';
import { BalancesClientView } from '@/components/merchant/BalancesClientView';

export const metadata: Metadata = { title: 'Held Balances | Merchant Cockpit' };

export default async function BalancesPage() {
  const initialBalances = [
    {
      currency: 'USD',
      total: 15400.0,
      available: 14800.0,
      withheld: 600.0,
      history_30d: [11200, 11800, 12400, 12100, 13500, 14200, 14800, 15400],
    },
    {
      currency: 'EUR',
      total: 3200.0,
      available: 3200.0,
      withheld: 0.0,
      history_30d: [2800, 2900, 3100, 3050, 3150, 3200, 3200, 3200],
    },
    {
      currency: 'GBP',
      total: 4850.0,
      available: 4500.0,
      withheld: 350.0,
      history_30d: [3900, 4100, 4300, 4200, 4600, 4700, 4800, 4850],
    },
  ];

  return <BalancesClientView initialBalances={initialBalances} />;
}
