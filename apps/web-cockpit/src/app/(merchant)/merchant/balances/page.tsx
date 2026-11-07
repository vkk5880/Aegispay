import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Held Balances | Merchant Cockpit' };

export default async function BalancesPage() {
  const balances = [
    { currency: 'USD', total: 15400.0, available: 14800.0, withheld: 600.0 },
    { currency: 'EUR', total: 3200.0, available: 3200.0, withheld: 0.0 },
  ];

  return (
    <EndpointPage
      title="Merchant Balances"
      calls={['GET /v1/reporting/balances']}
      source="getBalances()"
      note="The merchant account's balance across each held currency, reflecting available reserves and withheld escrow amounts."
      rows={balances}
      columns={[
        { field: 'currency', headerName: 'Currency', width: 120 },
        { field: 'total', headerName: 'Total Balance', type: 'money', flex: 1 },
        { field: 'available', headerName: 'Available Balance', type: 'money', flex: 1 },
        { field: 'withheld', headerName: 'Withheld (Escrow)', type: 'money', flex: 1 },
      ]}
    />
  );
}
