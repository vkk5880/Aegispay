'use client';

import React, { useRef, useEffect } from 'react';
import type { ProductCardData } from '@aegispay/shared-types';
import { Send, Scale, ShoppingBag, Sparkles, X, Tag, LogIn, CreditCard, User } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { AudioPromptButton } from './AudioPromptButton';

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
  const {
    user,
    isLoggedIn,
    isAuthorized,
    loginWithPayPal,
    authorizePayment,
    openProfileSidebar,
  } = useAuth();

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
      className="p-2 sm:p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-[#070d18]/95 backdrop-blur-md"
    >
      {/* Multi-Chip Input Bar Visualizer (Upgrade B - Section 3.2) */}
      {selectedProducts.length > 0 && (
        <div className="mb-2.5 p-2.5 rounded-xl bg-white dark:bg-[#060b17] border border-cyan-500/40 shadow-xs dark:shadow-md dark:shadow-cyan-950/20 transition-all animate-in fade-in slide-in-from-bottom-1 duration-200">
          {/* Header Row: Count & Clear All */}
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-cyan-800 dark:text-cyan-300">
                {`Selected (${selectedProducts.length}/4):`}
              </span>
              {selectedProducts.length >= 4 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Max 4 Limit
                </span>
              )}
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Combined: {formatCents((selectedProducts || []).reduce((sum, p) => sum + p.price_cents, 0))}
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
            {(selectedProducts || []).map((product) => (
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

      {/* Input Field & Submit Action with Left-Side Auth/Profile Button */}
      <div className="relative flex items-center gap-2">
        {/* Left Side: Login / Profile Button */}
        {!isLoggedIn ? (
          <button
            type="button"
            onClick={() => { loginWithPayPal(); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all cursor-pointer active:scale-95"
            title="Login with PayPal"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Login with PayPal</span>
          </button>
        ) : !isAuthorized ? (
          <button
            type="button"
            onClick={() => { authorizePayment(); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer active:scale-95 animate-pulse"
            title="Authorize Payment"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Authorize Payment</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openProfileSidebar}
            className="shrink-0 flex items-center gap-2 p-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0c1424] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
            title={`${user?.name} - Click to open Profile Sidebar`}
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center text-xs font-black shadow-xs">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <span className="hidden md:inline text-xs font-bold text-slate-800 dark:text-slate-200 max-w-[80px] truncate">
              {user?.name?.split(' ')[0]}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </button>
        )}

        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={placeholder || defaultPlaceholder}
            disabled={isLoading}
            className="w-full pl-3.5 pr-28 sm:pr-32 py-2 sm:py-2.5 bg-white dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            <AudioPromptButton
              onTranscript={(transcript) => {
                const updated = inputMessage.trim()
                  ? `${inputMessage.trim()} ${transcript}`
                  : transcript;
                onInputChange(updated);
              }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || (!inputMessage.trim() && selectedProducts.length === 0)}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
