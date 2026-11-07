import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

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

  return (
    <EndpointPage
      title="Commercial Invoices"
      calls={['GET /v2/invoicing/invoices', 'GET /v2/invoicing/invoices/{id}']}
      source="listInvoices()"
      note="The list endpoint omits line items, payments and refunds, so each invoice is then fetched in full. Amounts are in the invoice's own currency."
      rows={invoices}
      columns={[
        { field: 'number', headerName: 'Invoice #', width: 120 },
        { field: 'status', headerName: 'Status', width: 110 },
        { field: 'recipient', headerName: 'Recipient', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1 },
        { field: 'invoiceDate', headerName: 'Invoice Date', type: 'timestamp', width: 130 },
        { field: 'dueDate', headerName: 'Due Date', type: 'timestamp', width: 130 },
        { field: 'total', headerName: 'Total', type: 'money', width: 120 },
        { field: 'paid', headerName: 'Paid', type: 'money', width: 120 },
        { field: 'due', headerName: 'Due', type: 'money', width: 120 },
        { field: 'lineItems', headerName: 'Items', width: 90 },
        { field: 'currency', headerName: 'Currency', width: 100 },
        { field: 'id', headerName: 'Invoice ID', width: 140 },
      ]}
    />
  );
}
