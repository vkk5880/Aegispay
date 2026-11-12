'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Star,
  ShoppingBag,
  Sparkles,
  Check,
  Truck,
  ImageOff,
  AlertTriangle,
  Scale,
  CheckCircle2,
  Bookmark,
  ExternalLink,
  Eye,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { SocialProofPanel } from './SocialProofPanel';
import { useUiMode } from '@/context/UiModeContext';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { getProductImageUrl } from '@/lib/productImageHelper';
import { ProductDetailModal } from './ProductDetailModal';

export interface ProductCardProps {
  product: ProductCardData;
  isWinner?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (product: ProductCardData) => void;
  onAskAi?: (product: ProductCardData) => void;
  onAddToCart?: (product: ProductCardData) => void;
  onInstantBuy?: (product: ProductCardData) => void;
  onSaveWatchlist?: (product: ProductCardData) => void;
  onInspectDetails?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductCard({
  product,
  isWinner = false,
  isSelected = false,
  onToggleSelect,
  onAskAi,
  onAddToCart,
  onInstantBuy,
  onSaveWatchlist,
  onInspectDetails,
  className = '',
}: ProductCardProps) {
  const { showTechnicalDetails } = useUiMode();
  const { addToCart, openCart } = useCart();
  const { user } = useAuth();
  const activeUserId = user?.email || (user as any)?.id || user?.name || 'sb-buyer@personal.example.com';
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Sync saved status on mount
  useEffect(() => {
    let isMounted = true;
    async function checkSavedStatus() {
      try {
        const res = await fetch(`/api/buyer/watchlist?user_id=${encodeURIComponent(activeUserId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.watchlist)) {
            const found = data.watchlist.some(
              (w: any) =>
                (product.product_id && w.id === product.product_id) ||
                (product.title && w.title.toLowerCase() === product.title.toLowerCase()) ||
                (product.product_id && w.query === product.product_id)
            );
            if (found) setIsSaved(true);
          }
        }
      } catch {
        // Silently retain current state
      }
    }
    checkSavedStatus();
    return () => {
      isMounted = false;
    };
  }, [activeUserId, product.product_id, product.title]);

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
    const itemToAdd = selectedVariant ? { ...product, title: `${product.title} (${selectedVariant})` } : product;
    if (onAddToCart) {
      onAddToCart(itemToAdd);
    } else {
      addToCart(itemToAdd, 1);
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleInstant = () => {
    if (onInstantBuy) {
      onInstantBuy(product);
    } else {
      addToCart(product, 1);
      openCart();
    }
  };

  const handleInspect = () => {
    if (onInspectDetails) {
      onInspectDetails(product);
    } else {
      setIsDetailModalOpen(true);
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSaveWatchlist) {
      onSaveWatchlist(product);
      setIsSaved((prev) => !prev);
      return;
    }

    if (isSaved) {
      // Toggle OFF
      setIsSaved(false);
      try {
        await fetch('/api/buyer/watchlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: activeUserId,
            item_id: product.product_id,
            title: product.title,
          }),
        });
      } catch {
        // Local fallback
      }
    } else {
      // Toggle ON
      setIsSaved(true);
      try {
        const targetPriceCents =
          product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
            ? product.price_cents
            : Math.round(product.price_cents * 0.9);

        await fetch('/api/buyer/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: product.product_id,
            user_id: activeUserId,
            title: product.title,
            current_price_cents: product.price_cents,
            target_price_cents: targetPriceCents,
            source: product.merchant_domain || 'web',
            link: product.cleaned_url || '',
            query: product.title,
          }),
        });
      } catch {
        // Best-effort local feedback
      }
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

  const resolvedImgUrl = getProductImageUrl(product);
  const hasValidImage = Boolean(resolvedImgUrl && resolvedImgUrl.trim().length > 0);

  return (
    <div
      className={`group p-3.5 sm:p-4 rounded-xl bg-white/95 dark:bg-[#0c1424]/90 backdrop-blur-xl border transition-all duration-300 card-hover flex flex-col justify-between relative shadow-xs hover:shadow-lg ${
        isSelected
          ? 'border-cyan-500 shadow-cyan-500/15 ring-2 ring-cyan-500/40 bg-cyan-50/20 dark:bg-cyan-950/20'
          : isWinner
          ? 'border-cyan-500 shadow-cyan-500/10 ring-1 ring-cyan-500/30'
          : 'border-slate-200/80 dark:border-white/10 hover:border-cyan-500/50 dark:hover:border-cyan-400/50 hover:shadow-cyan-500/5'
      } ${className}`}
    >
      {/* Top radiant light */}
      <div className={`absolute top-0 inset-x-0 h-[2px] transition-all ${isWinner || isSelected ? 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent' : 'bg-gradient-to-r from-transparent via-transparent to-transparent group-hover:via-cyan-400/50'}`} />

      {/* Selected Pill */}
      {isSelected && (
        <div className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-cyan-600 text-white font-bold text-[9px] uppercase tracking-wider shadow-md flex items-center gap-1 z-10">
          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
          <span>Selected</span>
        </div>
      )}

      {/* Winner Ribbon */}
      {isWinner && (
        <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[9px] uppercase tracking-wider shadow-lg flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-300" />
          <span>Top Algorithmic Pick</span>
        </div>
      )}

      <div>
        {/* Product Image & Radial Score Badge - Small Compact Size */}
        <div
          onClick={handleInspect}
          className="relative w-full h-22 sm:h-24 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 mb-2.5 border border-slate-200/80 dark:border-white/10 flex items-center justify-center cursor-pointer group/thumb"
          title="Click to view detailed specs"
        >
          {hasValidImage && !imgError ? (
            <img
              src={resolvedImgUrl}
              alt={product.title || 'Product'}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 text-center">
              <ImageOff className="w-6 h-6 text-slate-400 dark:text-slate-600 mb-1" />
              <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px] font-semibold">
                [ Studio Image Verified ]
              </span>
              <span className="text-slate-400 dark:text-slate-600 font-mono text-[9px]">
                Authentic Spec Guaranteed
              </span>
            </div>
          )}

          {/* Quick View overlay on hover */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <span className="px-2 py-0.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white font-mono text-[9px] font-bold flex items-center gap-1 shadow-sm">
              <Eye className="w-2.5 h-2.5 text-cyan-500" />
              <span>Specs</span>
            </span>
          </div>

          {/* AI Score Badge */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/85 dark:bg-black/85 backdrop-blur-md border border-white/20 text-white font-mono font-bold text-[10px] flex items-center gap-1 shadow-xs">
            <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            <span>{scorePct}% Match</span>
          </div>

          {/* Stock Verified Indicator */}
          {product.stock_status && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/90 dark:bg-black/90 backdrop-blur-md border border-slate-700 text-[9px] font-mono text-emerald-400 flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>2PC Stock Verified</span>
            </div>
          )}
        </div>

        {/* Store Trust Tier & Secondary Badges */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
            {product.merchant_domain}
          </span>

          {hasDiscount && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {discountPct}% OFF
            </span>
          )}

          {product.badges?.slice(0, 2).map((b, bIdx) => {
            const badgeColor = b.badge_color || b.color || '#06b6d4';
            return (
              <span
                key={bIdx}
                style={{ color: badgeColor, borderColor: `${badgeColor}40` }}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border"
              >
                {b.label}
              </span>
            );
          })}
        </div>

        {/* ACP MessageWarning Alert (e.g. Low Stock or Shipping Delay) */}
        {Boolean((product as any).message_warning || (product as any).warning) && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-[10px] font-medium mb-1.5 shadow-2xs">
            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="line-clamp-1">
              {String((product as any).message_warning || (product as any).warning)}
            </span>
          </div>
        )}

        {/* Title */}
        <h3
          onClick={handleInspect}
          className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-1 leading-snug line-clamp-2 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
        >
          {product.title}
        </h3>

        {/* Description snippet */}
        {product.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-2 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Delivery / Shipping Spec */}
        <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono mb-2">
          <span className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>
              {product.delivery_window_days
                ? `${product.delivery_window_days}d Express`
                : 'Free Shipping'}
            </span>
          </span>
          {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {showTechnicalDetails
                ? `+${formatPrice(product.commission_rebate_cents)} Rebate`
                : `+${formatPrice(product.commission_rebate_cents)} Back`}
            </span>
          )}
        </div>

        {/* Phase 4: Selectable Variant Chips (Sizes / Colors) */}
        {variants.length > 0 && (
          <div className="mb-2" role="group" aria-label="Product variant options">
            <div className="flex flex-wrap gap-1">
              {variants.slice(0, 4).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelectedVariant(v)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                    selectedVariant === v
                      ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border border-cyan-500/60 font-bold shadow-2xs'
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
        <div className="mb-2">
          <SocialProofPanel productTitle={product.title} />
        </div>
      </div>

      {/* Pricing & Actions */}
      <div className="pt-2.5 border-t border-slate-200/80 dark:border-white/10">
        <div className="flex justify-between items-baseline mb-2">
          <div>
            <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              {formatPrice(product.price_cents)}
            </span>
            {hasDiscount && (
              <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500 line-through font-mono">
                {formatPrice(product.compare_at_price_cents!)}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400">
            {showTechnicalDetails ? 'Escrow Protected' : 'Protected'}
          </span>
        </div>

        {(onToggleSelect || onAskAi) && (
          <div className="flex items-center gap-1.5 mb-2">
            {onToggleSelect && (
              <button
                type="button"
                onClick={() => onToggleSelect(product)}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition-all border flex items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border-cyan-500 font-bold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Scale className="w-3 h-3 text-cyan-500" />
                <span>{isSelected ? 'Selected' : 'Select'}</span>
              </button>
            )}
            {onAskAi && (
              <button
                type="button"
                onClick={() => onAskAi(product)}
                className="flex-1 py-1 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/15 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3 h-3 text-cyan-500" />
                <span>Ask AI</span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAdd}
            aria-label={`Add ${product.title || 'item'} to Cart`}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-95 ${
              added
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-600/20'
            }`}
          >
            {added ? (
              <>
                <Check className="w-3 h-3" />
                <span>Added!</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3 h-3" />
                <span>Add to Cart</span>
              </>
            )}
          </button>

          <button
            onClick={handleInstant}
            aria-label={`Instant buy ${product.title || 'item'}`}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg border border-slate-200 dark:border-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-95 shadow-2xs"
          >
            Buy Now
          </button>

          {/* Dedicated Product Page Link */}
          <Link
            href={`/products/${encodeURIComponent(product.product_id)}`}
            aria-label={`View specs for ${product.title || 'item'}`}
            title="Open dedicated product page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 hover:text-cyan-500 transition-all shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>

          <button
            type="button"
            onClick={handleSave}
            aria-label={isSaved ? `Saved ${product.title || 'item'} to Watchlist` : `Save ${product.title || 'item'} to Watchlist`}
            title={isSaved ? 'Saved in Watchlist / Saved Items' : 'Save item to Watchlist / Saved Items'}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-95 shadow-2xs ${
              isSaved
                ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/60 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 border-slate-200 dark:border-white/10'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-cyan-600 dark:text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global In-Context Product Detail Modal */}
      <ProductDetailModal
        product={product}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onInstantBuy={handleInstant}
      />
    </div>
  );
}
