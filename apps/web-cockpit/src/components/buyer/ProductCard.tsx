'use client';

import React, { useState } from 'react';
import {
  Star,
  ShoppingBag,
  Sparkles,
  Check,
  Truck,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { SocialProofPanel } from './SocialProofPanel';

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
  const [added, setAdded] = useState(false);

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const handleAdd = () => {
    if (onAddToCart) {
      onAddToCart(product);
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

  return (
    <div
      className={`p-5 rounded-2xl bg-slate-900/70 border transition-all card-hover flex flex-col justify-between relative shadow-xl ${
        isWinner
          ? 'border-cyan-500 shadow-cyan-950/40 ring-1 ring-cyan-500/30'
          : 'border-slate-800 hover:border-slate-700'
      } ${className}`}
    >
      {/* Winner Ribbon */}
      {isWinner && (
        <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>Top Algorithmic Pick</span>
        </div>
      )}

      <div>
        {/* Product Image & Radial Score Badge */}
        <div className="relative w-full h-48 rounded-xl overflow-hidden bg-slate-950 mb-4 border border-slate-800">
          {product.cleaned_url ? (
            <img
              src={product.cleaned_url}
              alt={product.title}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 font-mono text-xs">
              [ Studio Image Verified ]
            </div>
          )}

          {/* AI Score Badge */}
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/20 text-white font-mono font-black text-xs flex items-center gap-1 shadow-lg">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>{scorePct}% Match</span>
          </div>

          {/* 2PC Stock Verified Indicator */}
          {product.stock_status && (
            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>2PC Stock Verified</span>
            </div>
          )}
        </div>

        {/* Store Trust Tier & Secondary Badges */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-cyan-500/20">
            {product.merchant_domain}
          </span>

          {hasDiscount && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-500/30">
              {discountPct}% OFF
            </span>
          )}

          {product.badges?.slice(0, 2).map((b, bIdx) => (
            <span
              key={bIdx}
              style={{ color: b.badge_color, borderColor: `${b.badge_color}40` }}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 border"
            >
              {b.label}
            </span>
          ))}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white mb-1.5 leading-snug line-clamp-2">
          {product.title}
        </h3>

        {/* Description snippet */}
        {product.description && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-3">
            {product.description}
          </p>
        )}

        {/* Delivery / Shipping Spec */}
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mb-3">
          <span className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {product.delivery_window_days
                ? `${product.delivery_window_days}-Day Express`
                : 'Free 2-Day Shipping'}
            </span>
          </span>
          {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
            <span className="text-emerald-400 font-bold">
              +{formatPrice(product.commission_rebate_cents)} Rebate
            </span>
          )}
        </div>

        {/* Embedded Community Sentiment Accordion */}
        <div className="mb-4">
          <SocialProofPanel productTitle={product.title} />
        </div>
      </div>

      {/* Pricing & Knapsack Add Actions */}
      <div className="pt-3 border-t border-slate-800">
        <div className="flex justify-between items-baseline mb-3">
          <div>
            <span className="text-2xl font-black text-white font-mono">
              {formatPrice(product.price_cents)}
            </span>
            {hasDiscount && (
              <span className="ml-2 text-xs text-slate-500 line-through font-mono">
                {formatPrice(product.compare_at_price_cents!)}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-cyan-400">
            Escrow Protected
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onAddToCart && (
            <button
              onClick={handleAdd}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer ${
                added
                  ? 'bg-emerald-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/50'
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
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              Instant Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
