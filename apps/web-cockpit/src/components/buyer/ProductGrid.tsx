'use client';

import React, { useState } from 'react';
import type { ProductCardData } from '@aegispay/shared-types';
import { ProductCard } from './ProductCard';
import { Sparkles, ArrowUpDown } from 'lucide-react';

export interface ProductGridProps {
  products: ProductCardData[];
  loading?: boolean;
  onAddToCart?: (product: ProductCardData) => void;
  onInstantBuy?: (product: ProductCardData) => void;
  className?: string;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col gap-3 min-h-[360px]">
      <div className="w-full h-44 rounded-xl bg-slate-800/60" />
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 rounded bg-slate-800" />
        <div className="h-4 w-16 rounded bg-slate-800" />
      </div>
      <div className="h-5 w-3/4 rounded bg-slate-800" />
      <div className="h-4 w-full rounded bg-slate-800" />
      <div className="mt-auto h-7 w-24 rounded bg-slate-800" />
      <div className="h-9 w-full rounded-xl bg-slate-800" />
    </div>
  );
}

export function ProductGrid({
  products,
  loading = false,
  onAddToCart,
  onInstantBuy,
  className = '',
}: ProductGridProps) {
  const [sortBy, setSortBy] = useState<'SCORE' | 'PRICE_ASC' | 'REBATE'>('SCORE');

  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800">
        <p className="text-slate-400 font-mono text-sm">
          No matching products found. Try adjusting your search query or budget cap.
        </p>
      </div>
    );
  }

  // Sort products based on user preference
  const sorted = [...products].sort((a, b) => {
    if (sortBy === 'PRICE_ASC') {
      return a.price_cents - b.price_cents;
    }
    if (sortBy === 'REBATE') {
      return (b.commission_rebate_cents || 0) - (a.commission_rebate_cents || 0);
    }
    return (b.composite_score || 0) - (a.composite_score || 0);
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Grid Toolbar: Sort & Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 pb-2 border-b border-slate-800/80">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Showing {sorted.length} Algorithmic Recommendations</span>
        </span>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-slate-500">
            <ArrowUpDown className="w-3 h-3" />
            <span>Sort:</span>
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="SCORE">Composite Score (Default)</option>
            <option value="PRICE_ASC">Lowest Price First</option>
            <option value="REBATE">Highest Commission Rebate</option>
          </select>
        </div>
      </div>

      {/* Grid of Product Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sorted.map((p, idx) => (
          <ProductCard
            key={p.product_id}
            product={p}
            isWinner={idx === 0 && sortBy === 'SCORE'}
            onAddToCart={onAddToCart}
            onInstantBuy={onInstantBuy}
          />
        ))}
      </div>
    </div>
  );
}
