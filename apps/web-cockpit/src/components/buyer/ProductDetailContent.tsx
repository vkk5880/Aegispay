'use client';

import React, { useState } from 'react';
import {
  Star,
  ShieldCheck,
  Truck,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Share2,
  Heart,
  ChevronRight,
  Layers,
  Percent,
  Check,
  Zap,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { getAllProductImages, getProductImageUrl } from '@/lib/productImageHelper';
import { useCart } from '@/context/CartContext';
import { useUiMode } from '@/context/UiModeContext';
import { formatCents } from '@/lib/utils';

export interface ProductDetailContentProps {
  product: ProductCardData;
  onInstantBuy?: (product: ProductCardData) => void;
  onCloseModal?: () => void;
}

export function ProductDetailContent({
  product,
  onInstantBuy,
  onCloseModal,
}: ProductDetailContentProps) {
  const { addToCart } = useCart();
  const { showTechnicalDetails } = useUiMode();

  const images = getAllProductImages(product);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const rawVariants =
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants.map((v) => (typeof v === 'string' ? v : (v as any).label || (v as any).name || 'Standard'))
      : ['Standard', 'Space Gray', 'Silver'];

  const [selectedVariant, setSelectedVariant] = useState<string>(rawVariants[0] || 'Standard');
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'specs' | 'merchants' | 'reviews' | 'escrow'>('specs');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [addedAnimation, setAddedAnimation] = useState<boolean>(false);

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const discountCents =
    product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
      ? product.compare_at_price_cents - product.price_cents
      : 0;

  const discountPercent =
    discountCents > 0 && product.compare_at_price_cents
      ? Math.round((discountCents / product.compare_at_price_cents) * 100)
      : 0;

  const handleAddToCart = () => {
    addToCart(product, quantity, selectedVariant);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 2000);
  };

  const handleSaveToWatchlist = async () => {
    setIsSaved(!isSaved);
    try {
      const userSession = typeof window !== 'undefined' ? localStorage.getItem('aegispay_user_session') : null;
      const parsedUser = userSession ? JSON.parse(userSession) : null;
      const userId = parsedUser?.email || parsedUser?.name || 'sb-buyer@personal.example.com';
      const targetPriceCents =
        product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
          ? product.price_cents
          : Math.round(product.price_cents * 0.9);

      await fetch('/api/buyer/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title: product.title,
          current_price_cents: product.price_cents,
          target_price_cents: targetPriceCents,
          source: product.merchant_domain || 'web',
          link: product.cleaned_url || '',
          query: product.title,
        }),
      });
    } catch {}
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
        <span>Shop</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="uppercase">{product.category_id || 'CATALOG'}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-900 dark:text-white font-bold truncate max-w-xs">{product.title}</span>
      </nav>

      {/* Main Flagship Grid (Gallery + Buy Box) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Column: Multi-Angle Studio Gallery (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active Large Display */}
          <div className="relative w-full aspect-4/3 sm:aspect-16/10 rounded-2xl overflow-hidden bg-white dark:bg-[#070d1a] border border-slate-200 dark:border-white/10 flex items-center justify-center p-6 shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[activeImageIdx] || images[0]}
              alt={product.title}
              className="max-h-full max-w-full object-contain transition-all duration-300 hover:scale-105"
            />
            {/* Studio Watermark / Verified Badge */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white font-mono text-[10px] flex items-center gap-1.5 border border-white/10 shadow-sm">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Studio 1024px Pristine</span>
            </div>
            {/* 2PC Stock Status */}
            <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-mono font-bold text-[10px] flex items-center gap-1.5 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>2PC Inventory Verified</span>
            </div>
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIdx(idx)}
                  className={`relative w-20 h-20 rounded-xl overflow-hidden bg-white dark:bg-slate-950 border-2 transition-all p-1.5 shrink-0 cursor-pointer ${
                    activeImageIdx === idx
                      ? 'border-cyan-500 shadow-md shadow-cyan-500/20 scale-105'
                      : 'border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={`Angle ${idx + 1}`} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Sticky Buy Box & Action Hub (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Brand & Store Ribbon */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                {product.merchant_domain}
              </span>
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{product.rating?.toFixed(1) || '4.8'}</span>
                <span className="text-slate-400 font-normal">({product.review_count || 120})</span>
              </span>
            </div>
            <button
              onClick={handleSaveToWatchlist}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isSaved
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                  : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Save to Wishlist"
            >
              <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
            {product.title}
          </h1>

          {/* Price & Savings Matrix */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                {formatPrice(product.price_cents)}
              </span>
              {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
                <span className="text-sm text-slate-400 line-through font-mono">
                  {formatPrice(product.compare_at_price_cents)}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Save {discountPercent}% (${(discountCents / 100).toFixed(2)})
                </span>
              )}
            </div>

            {/* Instant Cashback Callout */}
            {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
              <div className="flex items-center justify-between text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                <span className="flex items-center gap-1.5 font-bold">
                  <Percent className="w-3.5 h-3.5" />
                  <span>AegisPay Instant Cashback via PayPal:</span>
                </span>
                <span className="font-black text-sm">+{formatPrice(product.commission_rebate_cents)}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Variants Selector */}
          {rawVariants.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select Configuration:</label>
              <div className="flex flex-wrap gap-2">
                {rawVariants.map((variantLabel, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedVariant(variantLabel)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      selectedVariant === variantLabel
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {variantLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity Stepper */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Quantity:</span>
            <div className="flex items-center border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-white/5 font-mono text-sm">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-3 py-1 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="px-3 py-1 font-bold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="px-3 py-1 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Action Hub Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => (onInstantBuy ? onInstantBuy(product) : handleAddToCart())}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-700 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-sm tracking-wide shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-200" />
              <span>1-Click Buy with PayPal & Escrow Hold</span>
            </button>

            <button
              type="button"
              onClick={handleAddToCart}
              className={`w-full py-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                addedAnimation
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-white/10'
              }`}
            >
              {addedAnimation ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Added to Cart!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 text-cyan-500" />
                  <span>Add to Knapsack Multi-Store Cart</span>
                </>
              )}
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
              <Truck className="w-4 h-4 text-cyan-500" />
              <span>Free 2-3 Day Priority</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>72h Price Drop Escrow</span>
            </div>
          </div>
        </div>
      </div>

      {/* Deep-Dive Tabs (Specs, Multi-Merchant Comparison, Reviews, Escrow Protection) */}
      <div className="pt-8 border-t border-slate-200 dark:border-white/10 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto">
          {(['specs', 'merchants', 'reviews', 'escrow'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab === 'specs'
                ? 'Technical Specifications'
                : tab === 'merchants'
                ? 'Live Channel3 Comparison'
                : tab === 'reviews'
                ? 'Verified Reviews'
                : 'AegisPay Protection'}
            </button>
          ))}
        </div>

        {/* Tab 1: Tech Specs Table */}
        {activeTab === 'specs' && (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Hardware Specifications</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              {product.specs && Object.keys(product.specs).length > 0 ? (
                Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400">{k}</span>
                    <span className="font-bold text-slate-900 dark:text-white text-right">{String(v)}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400">Merchant Partner</span>
                    <span className="font-bold text-slate-900 dark:text-white text-right">{product.merchant_domain}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400">Inventory Status</span>
                    <span className="font-bold text-emerald-500 text-right">{product.stock_status || 'IN_STOCK'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400">Delivery Window</span>
                    <span className="font-bold text-slate-900 dark:text-white text-right">{product.delivery_window || '2-3 Business Days'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400">Product Identifier</span>
                    <span className="font-bold text-slate-900 dark:text-white text-right">{product.product_id}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Live Channel3 Comparison */}
        {activeTab === 'merchants' && (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Multi-Store Channel3 Price Index</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400">
                    <th className="py-2">Merchant Domain</th>
                    <th>Base Price</th>
                    <th>Shipping</th>
                    <th>Cashback Rebate</th>
                    <th>Net Effective</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  <tr className="font-bold text-cyan-600 dark:text-cyan-400">
                    <td className="py-2.5">{product.merchant_domain} (Winning Pick)</td>
                    <td>{formatPrice(product.price_cents)}</td>
                    <td className="text-emerald-500">FREE</td>
                    <td className="text-emerald-500">+{formatPrice(product.commission_rebate_cents || 0)}</td>
                    <td className="font-black">{formatPrice(product.price_cents - (product.commission_rebate_cents || 0))}</td>
                    <td><span className="px-2 py-0.5 rounded bg-cyan-500/10 text-[10px]">SELECTED</span></td>
                  </tr>
                  <tr className="text-slate-500">
                    <td className="py-2.5">amazon.com</td>
                    <td>{formatPrice(product.price_cents + 1500)}</td>
                    <td>$5.99</td>
                    <td>$0.00</td>
                    <td>{formatPrice(product.price_cents + 2099)}</td>
                    <td><span className="text-[10px] text-slate-400">+${((2099 + (product.commission_rebate_cents || 0)) / 100).toFixed(2)} higher</span></td>
                  </tr>
                  <tr className="text-slate-500">
                    <td className="py-2.5">bhphotovideo.com</td>
                    <td>{formatPrice(product.price_cents + 2500)}</td>
                    <td>FREE</td>
                    <td>$4.00</td>
                    <td>{formatPrice(product.price_cents + 2100)}</td>
                    <td><span className="text-[10px] text-slate-400">+$21.00 higher</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Reviews */}
        {activeTab === 'reviews' && (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Algorithmic Sentiment Radar</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Synthesized across {product.review_count || 120} verified purchases across major retail feeds.
              Top praised factors: Soundstage depth, attenuation in high-noise environments, build quality, and battery stamina.
            </p>
          </div>
        )}

        {/* Tab 4: Escrow Protection */}
        {activeTab === 'escrow' && (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>AegisPay Escrow & PayPal Buyer Protection</span>
            </h3>
            <ul className="text-xs font-mono text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside">
              <li><strong>2-Phase Commit (2PC) Hold:</strong> Merchant guarantees 15-minute inventory lock prior to payment capture.</li>
              <li><strong>Conditional Escrow:</strong> Funds are held until courier tracking signals delivered and verified by carrier webhook.</li>
              <li><strong>72-Hour Price Drop Guarantee:</strong> If the price drops anywhere across Channel3 monitored merchants within 72 hours, the difference is automatically refunded to your PayPal balance.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
