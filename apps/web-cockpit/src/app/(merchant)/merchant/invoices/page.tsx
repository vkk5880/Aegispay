import React from 'react';
import type { Metadata } from 'next';
import { InvoicesClientView } from '@/components/merchant/InvoicesClientView';

export const metadata: Metadata = { title: 'Invoices | Merchant Cockpit' };

export default async function InvoicesPage() {
  return <InvoicesClientView initialInvoices={[]} />;
}
