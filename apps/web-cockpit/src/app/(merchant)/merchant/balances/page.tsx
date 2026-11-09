import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Held Balances | Merchant Cockpit' };

export default async function BalancesPage() {
  const balances = [
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

  return (
    <EndpointPage
      title="Merchant Balances & Liquidity"
      calls={['GET /v1/reporting/balances']}
      source="getBalances()"
      note="The merchant account's balance across each held currency, reflecting available reserves, withheld escrow amounts, and 30-day settlement trajectory."
      rows={balances}
      columns={[
        { field: 'currency', headerName: 'Currency', width: 120, enableRowGroup: true },
        { field: 'total', headerName: 'Total Balance', type: 'money', width: 140, aggFunc: 'sum' },
        { field: 'available', headerName: 'Available Balance', type: 'money', width: 150, aggFunc: 'sum' },
        { field: 'withheld', headerName: 'Withheld (Escrow)', type: 'money', width: 150, aggFunc: 'sum' },
        {
          field: 'history_30d',
          headerName: '30-Day Settlement Trajectory',
          minWidth: 220,
          flex: 1,
          cellRenderer: 'agSparklineCellRenderer',
          cellRendererParams: {
            sparklineOptions: {
              type: 'area',
              fill: 'rgba(0, 112, 224, 0.2)',
              line: { stroke: '#0070e0', strokeWidth: 2 },
              highlightStyle: { fill: '#06b6d4' },
            },
          },
        },
      ]}
    />
  );
}
