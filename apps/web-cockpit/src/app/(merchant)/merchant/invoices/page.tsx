import React from 'react';
import type { Metadata } from 'next';
import { InvoicesClientView } from '@/components/merchant/InvoicesClientView';

export const metadata: Metadata = { title: 'Invoices | Merchant Cockpit' };

export default async function InvoicesPage() {
  const invoices = [
    {
      id: 'INV-DEMO-1',
      number: 'INV-001',
      status: 'PAID',
      recipient: 'Acme Corp',
      email: 'billing@acme.com',
      invoiceDate: '2026-11-01',
      dueDate: '2026-12-01',
      total: 450.0,
      paid: 450.0,
      due: 0.0,
      lineItems: 3,
      currency: 'USD',
    },
  ];

  return <InvoicesClientView initialInvoices={invoices} />;
}
