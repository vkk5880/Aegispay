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
      recent_bids_distribution: [5, 12, 18, 24, 30, 22, 35, 42, 50],
    },
    {
      id: 'PROD-2',
      name: 'Physical Hardware Lock',
      type: 'PHYSICAL' as const,
      category: 'ELECTRONICS',
      description: 'Physical USB hardware authentication key',
      create_time: '2026-09-15T15:30:00Z',
      recent_bids_distribution: [2, 4, 8, 10, 15, 12, 20, 25, 28],
    },
    {
      id: 'PROD-3',
      name: 'Channel3 Vision Coprocessor',
      type: 'PHYSICAL' as const,
      category: 'ELECTRONICS',
      description: 'Edge-AI vision processing kit for continuous product authentication',
      create_time: '2026-10-01T09:00:00Z',
      recent_bids_distribution: [8, 15, 22, 35, 45, 60, 75, 88, 95],
    },
  ];

  return (
    <EndpointPage
      title="Catalog Products & Bid Velocity"
      calls={['GET /v1/catalogs/products', 'GET /v1/catalogs/products/{id}']}
      source="listProducts()"
      note="The list endpoint returns product catalog definitions, enriched with real-time synthetic intent bid velocity column sparklines."
      rows={products.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        category: p.category,
        description: p.description,
        created: p.create_time,
        recent_bids_distribution: p.recent_bids_distribution,
      }))}
      columns={[
        { field: 'name', headerName: 'Name', flex: 1, enableRowGroup: true },
        { field: 'type', headerName: 'Type', width: 120, enableRowGroup: true },
        { field: 'category', headerName: 'Category', width: 140, enableRowGroup: true },
        {
          field: 'recent_bids_distribution',
          headerName: 'Real-Time Bid Velocity',
          width: 180,
          cellRenderer: 'agSparklineCellRenderer',
          cellRendererParams: {
            sparklineOptions: {
              type: 'column',
              fill: '#10b981',
              padding: { top: 2, bottom: 2 },
              highlightStyle: { fill: '#06b6d4' },
            },
          },
        },
        { field: 'description', headerName: 'Description', flex: 2 },
        { field: 'created', headerName: 'Created', type: 'dateTime', width: 200 },
        { field: 'id', headerName: 'Product ID', width: 140 },
      ]}
    />
  );
}
