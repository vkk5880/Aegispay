import React from 'react';
import type { Metadata } from 'next';
import { ProductsClientView } from '@/components/merchant/ProductsClientView';

export const metadata: Metadata = { title: 'Catalog Products | Merchant Cockpit' };

export default async function ProductsPage() {
  const initialProducts = [
    {
      id: 'PROD-1',
      name: 'Standard Subscription',
      type: 'DIGITAL',
      category: 'SOFTWARE',
      description: 'Monthly SaaS seat tier with real-time analytics access',
      created: '2026-09-01T12:00:00Z',
      recent_bids_distribution: [5, 12, 18, 24, 30, 22, 35, 42, 50],
    },
    {
      id: 'PROD-2',
      name: 'Physical Hardware Lock',
      type: 'PHYSICAL',
      category: 'ELECTRONICS',
      description: 'Physical USB hardware authentication key',
      created: '2026-09-15T15:30:00Z',
      recent_bids_distribution: [2, 4, 8, 10, 15, 12, 20, 25, 28],
    },
    {
      id: 'PROD-3',
      name: 'Channel3 Vision Coprocessor',
      type: 'PHYSICAL',
      category: 'ELECTRONICS',
      description: 'Edge-AI vision processing kit for continuous product authentication',
      created: '2026-10-01T09:00:00Z',
      recent_bids_distribution: [8, 15, 22, 35, 45, 60, 75, 88, 95],
    },
  ];

  return <ProductsClientView initialProducts={initialProducts} />;
}
