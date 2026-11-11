import React from 'react';
import type { Metadata } from 'next';
import { ProductsClientView } from '@/components/merchant/ProductsClientView';

export const metadata: Metadata = { title: 'Catalog Products | Merchant Cockpit' };

export default async function ProductsPage() {
  return <ProductsClientView initialProducts={[]} />;
}
