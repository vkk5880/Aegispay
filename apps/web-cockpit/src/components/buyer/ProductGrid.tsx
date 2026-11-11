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
    <div className="animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex flex-col gap-2.5 min-h-[280px]">
      <div className="w-full h-32 sm:h-36 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3.5 w-12 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-3.5 w-full rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-auto h-6 w-20 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-8 w-full rounded-xl bg-slate-200 dark:bg-slate-800" />
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
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
        <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">
          No matching products found. Try adjusting your search query or budget cap.
        </p>
      </div>
    );
  }

  // Sort products safely based on user preference, handling undefined/NaN defensively
  const sorted = [...products].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    if (sortBy === 'PRICE_ASC') {
      const priceA = typeof a.price_cents === 'number' && !isNaN(a.price_cents) ? a.price_cents : 0;
      const priceB = typeof b.price_cents === 'number' && !isNaN(b.price_cents) ? b.price_cents : 0;
      return priceA - priceB;
    }
    if (sortBy === 'REBATE') {
      const rebateA = typeof a.commission_rebate_cents === 'number' && !isNaN(a.commission_rebate_cents) ? a.commission_rebate_cents : 0;
      const rebateB = typeof b.commission_rebate_cents === 'number' && !isNaN(b.commission_rebate_cents) ? b.commission_rebate_cents : 0;
      return rebateB - rebateA;
    }
    const scoreA = typeof a.composite_score === 'number' && !isNaN(a.composite_score) ? a.composite_score : 0;
    const scoreB = typeof b.composite_score === 'number' && !isNaN(b.composite_score) ? b.composite_score : 0;
    return scoreB - scoreA;
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Grid Toolbar: Sort & Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800/80">
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <span>Showing {sorted.length} Algorithmic Recommendations</span>
        </span>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <ArrowUpDown className="w-3 h-3" />
            <span>Sort:</span>
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 cursor-pointer shadow-2xs"
          >
            <option value="SCORE">Composite Score (Default)</option>
            <option value="PRICE_ASC">Lowest Price First</option>
            <option value="REBATE">Highest Commission Rebate</option>
          </select>
        </div>
      </div>

      {/* Grid of Product Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {sorted.map((p, idx) => (
          <ProductCard
            key={p.product_id || `product-idx-${idx}`}
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
