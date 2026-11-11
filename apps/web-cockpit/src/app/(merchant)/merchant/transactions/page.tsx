import React from 'react';
import type { Metadata } from 'next';
import { TransactionsClientView } from '@/components/merchant/TransactionsClientView';

export const metadata: Metadata = { title: 'Transactions | Merchant Cockpit' };

export default async function TransactionsPage() {
  return <TransactionsClientView initialTransactions={[]} />;
}
