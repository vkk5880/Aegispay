import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Catalog Products | Merchant Cockpit' };

export default async function ProductsPage() {
  const products = [
    {
      id: 'PROD-1',
      name: 'Standard Subscription',
      type: 'DIGITAL' as const,
      category: 'SOFTWARE',
      description: 'Monthly SaaS seat tier with real-time analytics access',
      create_time: '2026-09-01T12:00:00Z',
    },
    {
      id: 'PROD-2',
      name: 'Physical Hardware Lock',
      type: 'PHYSICAL' as const,
      category: 'ELECTRONICS',
      description: 'Physical USB hardware authentication key',
      create_time: '2026-09-15T15:30:00Z',
    },
  ];

  return (
    <EndpointPage
      title="Catalog Products"
      calls={['GET /v1/catalogs/products', 'GET /v1/catalogs/products/{id}']}
      source="listProducts()"
      note="The list endpoint returns summaries without type or category, so each product is then fetched in full."
      rows={products.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        category: p.category,
        description: p.description,
        created: p.create_time,
      }))}
      columns={[
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'type', headerName: 'Type', width: 120 },
        { field: 'category', headerName: 'Category', width: 140 },
        { field: 'description', headerName: 'Description', flex: 2 },
        { field: 'created', headerName: 'Created', type: 'dateTime', width: 200 },
        { field: 'id', headerName: 'Product ID', width: 140 },
      ]}
    />
  );
}
