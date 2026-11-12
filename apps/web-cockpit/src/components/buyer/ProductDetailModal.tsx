'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { ProductDetailContent } from './ProductDetailContent';

export interface ProductDetailModalProps {
  product: ProductCardData | null;
  isOpen: boolean;
  onClose: () => void;
  onInstantBuy?: (product: ProductCardData) => void;
}

export function ProductDetailModal({
  product,
  isOpen,
  onClose,
  onInstantBuy,
}: ProductDetailModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl bg-white dark:bg-[#070d1a] border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Top Control Bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 bg-white/90 dark:bg-[#070d1a]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Quick View Spec
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/products/${encodeURIComponent(product.product_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-xs font-mono flex items-center gap-1.5"
              title="Open dedicated product page"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Full Page</span>
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
              aria-label="Close product detail modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto">
          <ProductDetailContent
            product={product}
            onInstantBuy={onInstantBuy}
            onCloseModal={onClose}
          />
        </div>
      </div>
    </div>
  );
}
