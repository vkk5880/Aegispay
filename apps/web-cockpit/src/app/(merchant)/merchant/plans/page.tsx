import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Billing Plans | Merchant Cockpit' };

export default async function PlansPage() {
  const plans = [
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

  return (
    <EndpointPage
      title="Billing Plans"
      calls={['GET /v1/billing/plans', 'GET /v1/billing/plans/{id}']}
      source="listPlans()"
      note="A plan's billing cycles hold its price: an optional TRIAL cycle followed by the REGULAR cycle that bills until cancelled."
      rows={plans}
      columns={[
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'productId', headerName: 'Product ID', width: 130 },
        { field: 'status', headerName: 'Status', width: 110 },
        { field: 'price', headerName: 'Price', type: 'money', width: 120 },
        { field: 'billedEvery', headerName: 'Billed every', width: 130 },
        { field: 'trial', headerName: 'Trial', width: 110 },
        { field: 'setupFee', headerName: 'Setup fee', type: 'money', width: 120 },
        { field: 'currency', headerName: 'Currency', width: 100 },
        { field: 'created', headerName: 'Created', type: 'dateTime', width: 200 },
        { field: 'id', headerName: 'Plan ID', width: 130 },
      ]}
    />
  );
}
