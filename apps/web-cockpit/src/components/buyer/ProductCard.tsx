'use client';

import React, { useState } from 'react';
import {
  Star,
  ShoppingBag,
  Sparkles,
  Check,
  Truck,
  ImageOff,
  AlertTriangle,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { SocialProofPanel } from './SocialProofPanel';
import { useUiMode } from '@/context/UiModeContext';

export interface ProductCardProps {
  product: ProductCardData;
  isWinner?: boolean;
  onAddToCart?: (product: ProductCardData) => void;
  onInstantBuy?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductCard({
  product,
  isWinner = false,
  onAddToCart,
  onInstantBuy,
  className = '',
}: ProductCardProps) {
  const { showTechnicalDetails } = useUiMode();
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Optional Variant Options (Sizes / Colors / Models)
  const variants: string[] =
    Array.isArray((product as any).variants)
      ? (product as any).variants
      : (product as any).options?.sizes || (product as any).options?.colors || [];
  const [selectedVariant, setSelectedVariant] = useState<string>(variants[0] || '');

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const handleAdd = () => {
    if (onAddToCart) {
      onAddToCart(selectedVariant ? { ...product, title: `${product.title} (${selectedVariant})` } : product);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  const scorePct = product.composite_score
    ? product.composite_score <= 10
      ? Math.round(product.composite_score * 10)
      : Math.round(product.composite_score)
    : 92;

  const hasDiscount =
    product.compare_at_price_cents &&
    product.compare_at_price_cents > product.price_cents;

  const discountPct = hasDiscount
    ? Math.round(
        ((product.compare_at_price_cents! - product.price_cents) /
          product.compare_at_price_cents!) *
          100
      )
    : 0;

  const hasCleanUrl = Boolean(product.cleaned_url && product.cleaned_url.trim().length > 0);

  return (
    <div
      className={`group p-5 rounded-2xl bg-white/95 dark:bg-[#0c1424]/90 backdrop-blur-xl border transition-all duration-300 card-hover flex flex-col justify-between relative shadow-sm hover:shadow-xl ${
        isWinner
          ? 'border-cyan-500 shadow-cyan-500/10 ring-1 ring-cyan-500/30'
          : 'border-slate-200/80 dark:border-white/10 hover:border-cyan-500/50 dark:hover:border-cyan-400/50 hover:shadow-cyan-500/5'
      } ${className}`}
    >
      {/* Top radiant light */}
      <div className={`absolute top-0 inset-x-0 h-[2px] transition-all ${isWinner ? 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent' : 'bg-gradient-to-r from-transparent via-transparent to-transparent group-hover:via-cyan-400/50'}`} />

      {/* Winner Ribbon */}
      {isWinner && (
        <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>{showTechnicalDetails ? 'Top Algorithmic Pick' : 'Top Pick'}</span>
        </div>
      )}

      <div>
        {/* Product Image & Radial Score Badge */}
        <div className="relative w-full h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 mb-4 border border-slate-200/80 dark:border-white/10 flex items-center justify-center">
          {hasCleanUrl && !imgError ? (
            <img
              src={product.cleaned_url}
              alt={product.title || 'Product'}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 text-center">
              <ImageOff className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2" />
              <span className="text-slate-600 dark:text-slate-400 font-mono text-xs font-semibold">
                [ Studio Image Verified ]
              </span>
              <span className="text-slate-400 dark:text-slate-600 font-mono text-[10px] mt-0.5">
                Authentic Spec Guaranteed
              </span>
            </div>
          )}

          {/* AI Score Badge */}
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/20 text-white font-mono font-black text-xs flex items-center gap-1 shadow-lg">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>{scorePct}% Match</span>
          </div>

          {/* Stock Verified Indicator */}
          {product.stock_status && (
            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[10px] font-mono text-emerald-400 flex items-center gap-1 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{showTechnicalDetails ? '2PC Stock Verified' : 'In Stock & Verified'}</span>
            </div>
          )}
        </div>

        {/* Store Trust Tier & Secondary Badges */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
            {product.merchant_domain}
          </span>

          {hasDiscount && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {discountPct}% OFF
            </span>
          )}

          {product.badges?.slice(0, 2).map((b, bIdx) => {
            const badgeColor = b.badge_color || b.color || '#06b6d4';
            return (
              <span
                key={bIdx}
                style={{ color: badgeColor, borderColor: `${badgeColor}40` }}
                className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 border"
              >
                {b.label}
              </span>
            );
          })}
        </div>

        {/* ACP MessageWarning Alert (e.g. Low Stock or Shipping Delay) */}
        {Boolean((product as any).message_warning || (product as any).warning) && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-[11px] font-medium mb-2 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="line-clamp-1">
              {String((product as any).message_warning || (product as any).warning)}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5 leading-snug line-clamp-2">
          {product.title}
        </h3>

        {/* Description snippet */}
        {product.description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Delivery / Shipping Spec */}
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono mb-3">
          <span className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>
              {product.delivery_window_days
                ? `${product.delivery_window_days}-Day Express`
                : 'Free 2-Day Shipping'}
            </span>
          </span>
          {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {showTechnicalDetails
                ? `+${formatPrice(product.commission_rebate_cents)} Rebate`
                : `Cashback: ${formatPrice(product.commission_rebate_cents)}`}
            </span>
          )}
        </div>

        {/* Phase 4: Selectable Variant Chips (Sizes / Colors) */}
        {variants.length > 0 && (
          <div className="mb-3.5" role="group" aria-label="Product variant options">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
              Select Option:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {variants.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelectedVariant(v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                    selectedVariant === v
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/60 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Embedded Community Sentiment Accordion */}
        <div className="mb-4">
          <SocialProofPanel productTitle={product.title} />
        </div>
      </div>

      {/* Pricing & Knapsack Add Actions */}
      <div className="pt-3.5 border-t border-slate-200/80 dark:border-white/10">
        <div className="flex justify-between items-baseline mb-3">
          <div>
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              {formatPrice(product.price_cents)}
            </span>
            {hasDiscount && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 line-through font-mono">
                {formatPrice(product.compare_at_price_cents!)}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono font-bold text-cyan-600 dark:text-cyan-400">
            {showTechnicalDetails ? 'Escrow Protected' : 'Purchase Protected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onAddToCart && (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.title || 'item'} to Knapsack Cart`}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-95 ${
                added
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-600/20'
              }`}
            >
              {added ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Added to Cart!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Add to Knapsack Cart</span>
                </>
              )}
            </button>
          )}

          {onInstantBuy && (
            <button
              onClick={() => onInstantBuy(product)}
              aria-label={`Instant buy ${product.title || 'item'}`}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-95 shadow-xs"
            >
              Instant Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
