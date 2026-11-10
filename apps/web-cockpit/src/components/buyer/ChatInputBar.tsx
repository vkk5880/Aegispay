'use client';

import React, { useRef, useEffect } from 'react';
import type { ProductCardData } from '@aegispay/shared-types';
import { Send, Scale, ShoppingBag, Sparkles, X, Tag } from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface ChatInputBarProps {
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  selectedProducts: ProductCardData[];
  onRemoveSelectedProduct: (productId: string) => void;
  onClearAllSelected: () => void;
  onCompareSelected?: () => void;
  onBundleSelected?: () => void;
  onAskAboutSingle?: (product: ProductCardData) => void;
  budgetCapCents?: number;
  placeholder?: string;
}

export function ChatInputBar({
  inputMessage,
  onInputChange,
  onSubmit,
  isLoading,
  selectedProducts,
  onRemoveSelectedProduct,
  onClearAllSelected,
  onCompareSelected,
  onBundleSelected,
  onAskAboutSingle,
  budgetCapCents = 50000,
  placeholder,
}: ChatInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when products are added or focused
  useEffect(() => {
    if (selectedProducts.length > 0) {
      inputRef.current?.focus();
    }
  }, [selectedProducts.length]);

  const defaultPlaceholder =
    selectedProducts.length >= 2
      ? `Ask to compare these ${selectedProducts.length} items or check budget feasibility...`
      : selectedProducts.length === 1
      ? `Ask AI about ${selectedProducts[0].title.slice(0, 24)}... (specs, warranty, details)`
      : "Ask about products, compare specs, or say 'Buy for me'...";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50/80 dark:bg-[#070d18]/80 backdrop-blur-md"
    >
      {/* Multi-Chip Input Bar Visualizer (Upgrade B - Section 3.2) */}
      {selectedProducts.length > 0 && (
        <div className="mb-2.5 p-2.5 rounded-xl bg-white dark:bg-[#060b17] border border-cyan-500/40 shadow-xs dark:shadow-md dark:shadow-cyan-950/20 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200">
          {/* Header Row: Count & Clear All */}
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-cyan-800 dark:text-cyan-300">
                {`Selected (${selectedProducts.length}):`}
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Combined: {formatCents(selectedProducts.reduce((sum, p) => sum + p.price_cents, 0))}
              </span>
            </div>
            <button
              type="button"
              onClick={onClearAllSelected}
              className="text-[11px] font-mono text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
            >
              (Clear All)
            </button>
          </div>

          {/* Interactive Dismissible Chips */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedProducts.map((product) => (
              <span
                key={product.product_id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0b1428] border border-cyan-500/30 text-slate-900 dark:text-slate-100 text-xs font-medium shadow-2xs group hover:border-cyan-500 transition-all"
              >
                <Tag className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span className="max-w-[170px] truncate font-medium" title={product.title}>
                  {product.title}
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
                  {formatCents(product.price_cents)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSelectedProduct(product.product_id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500 transition-all cursor-pointer ml-0.5"
                  aria-label={`Remove ${product.title}`}
                  title="Remove product"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>

          {/* One-Click Action Quick Triggers */}
          <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            {selectedProducts.length >= 2 && onCompareSelected && (
              <button
                type="button"
                onClick={onCompareSelected}
                className="text-xs px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Scale className="w-3 h-3" />
                <span>Compare Side-by-Side</span>
              </button>
            )}
            {selectedProducts.length >= 2 && onBundleSelected && (
              <button
                type="button"
                onClick={onBundleSelected}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <ShoppingBag className="w-3 h-3" />
                <span>{`Can I buy all within $${(budgetCapCents / 100).toFixed(0)} budget?`}</span>
              </button>
            )}
            {selectedProducts.length === 1 && onAskAboutSingle && (
              <button
                type="button"
                onClick={() => onAskAboutSingle(selectedProducts[0])}
                className="text-xs px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3 h-3" />
                <span>Ask AI about specs & warranty</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input Field & Submit Action */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder || defaultPlaceholder}
          disabled={isLoading}
          className="w-full pl-4 pr-24 py-3 bg-white dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
        />
        <button
          type="submit"
          disabled={isLoading || (!inputMessage.trim() && selectedProducts.length === 0)}
          className="absolute right-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}
