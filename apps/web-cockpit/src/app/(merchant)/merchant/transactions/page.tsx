import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Transactions | Merchant Cockpit' };

export default async function TransactionsPage() {
  const transactions = [
    {
      id: 'TXN-DEMO-001',
      date: '2026-11-04T14:22:00Z',
      eventCode: 'T0001',
      status: 'S',
      amount: 150.0,
      fee: 4.5,
      endingBalance: 15400.0,
      currency: 'USD',
      counterparty: 'affiliate@partner.com',
      subject: 'Affiliate settlement',
      note: 'AegisPay settlement voucher',
      customField: 'ESCROW-V3',
    },
  ];

  return (
    <EndpointPage
      title="Transaction Search (Last 31 Days)"
      calls={['GET /v1/reporting/transactions']}
      source="searchTransactions(start, end)"
      note="Transaction Search covers at most 31 days per request. Event codes are PayPal T-codes (T0001 = payout); status S = success, P = pending."
      rows={transactions}
      columns={[
        { field: 'date', headerName: 'Date', type: 'dateTime', width: 190 },
        { field: 'id', headerName: 'Transaction ID', width: 150 },
        { field: 'eventCode', headerName: 'Event Code', width: 110 },
        { field: 'status', headerName: 'Status', width: 90 },
        { field: 'amount', headerName: 'Amount', type: 'money', width: 120 },
        { field: 'fee', headerName: 'Fee', type: 'money', width: 100 },
        { field: 'endingBalance', headerName: 'Ending Balance', type: 'money', width: 140 },
        { field: 'counterparty', headerName: 'Counterparty', flex: 1 },
        { field: 'subject', headerName: 'Subject', flex: 1 },
      ]}
    />
  );
}
