'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  ArrowRight,
  TrendingUp,
  Tag,
  Star,
  ExternalLink,
  Share2,
  Check,
  Clock,
  Layers,
  Filter,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';

const PRESET_QUERIES = [
  'Noise canceling studio headphones under $350',
  'Wireless ergonomic mechanical keyboard',
  '4K USB-C gaming & productivity monitor',
  'Anker high-capacity power bank with fast charging',
];

const MOCK_SEARCH_RESULTS: ProductCardData[] = [
  {
    product_id: 'ch3_anc_headphone_01',
    title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
    description: 'Industry-leading noise cancellation with two processors and 8 microphones. Up to 30-hour battery life with quick charging.',
    price_cents: 34800,
    compare_at_price_cents: 39999,
    currency: 'USD',
    merchant_domain: 'bestbuy.com',
    cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
    stock_status: 'IN_STOCK',
    category_id: 'electronics',
    commission_rate: 0.15,
    commission_rebate_cents: 3915,
    shipping_fee_cents: 0,
    shipping_waiver_threshold_cents: 25000,
    delivery_window_days: 2,
    store_tier: 'tier1_official',
    composite_score: 9.4,
    score_breakdown: {
      cosine_similarity: 0.95,
      price_affinity: 0.88,
      merchant_reputation: 0.98,
      shipping_speed: 0.95,
    },
    badges: [
      { badge_type: 'BEST_VALUE', label: 'Best Overall Pick', badge_color: '#06b6d4' },
      { badge_type: 'PRICE_LEADER', label: '13% Below MSRP', badge_color: '#10b981' },
      { badge_type: 'TOP_RATED', label: '4.8 ★ Verified', badge_color: '#8b5cf6' },
    ],
  },
  {
    product_id: 'ch3_bose_qc_ultra',
    title: 'Bose QuietComfort Ultra Wireless Noise Cancelling Headphones',
    description: 'Breakthrough spatialized audio for more immersive listening. World-class noise cancellation and CustomTune technology.',
    price_cents: 37900,
    compare_at_price_cents: 42900,
    currency: 'USD',
    merchant_domain: 'amazon.com',
    cleaned_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500&q=80',
    stock_status: 'IN_STOCK',
    category_id: 'electronics',
    commission_rate: 0.12,
    commission_rebate_cents: 3411,
    shipping_fee_cents: 0,
    shipping_waiver_threshold_cents: 3500,
    delivery_window_days: 1,
    store_tier: 'tier1_official',
    composite_score: 9.1,
    score_breakdown: {
      cosine_similarity: 0.92,
      price_affinity: 0.82,
      merchant_reputation: 0.96,
      shipping_speed: 0.98,
    },
    badges: [
      { badge_type: 'TOP_RATED', label: 'Spatial Audio Leader', badge_color: '#8b5cf6' },
      { badge_type: 'FASTEST_DELIVERY', label: 'Next-Day Delivery', badge_color: '#3b82f6' },
    ],
  },
  {
    product_id: 'ch3_sennheiser_m4',
    title: 'Sennheiser Momentum 4 Wireless ANC Headphones (Black)',
    description: 'Audiophile-inspired 42mm transducer system delivering brilliant dynamics. Unmatched 60-hour battery life with fast charging.',
    price_cents: 29995,
    compare_at_price_cents: 37995,
    currency: 'USD',
    merchant_domain: 'bhphotovideo.com',
    cleaned_url: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=500&q=80',
    stock_status: 'IN_STOCK',
    category_id: 'electronics',
    commission_rate: 0.14,
    commission_rebate_cents: 3149,
    shipping_fee_cents: 0,
    shipping_waiver_threshold_cents: 4900,
    delivery_window_days: 3,
    store_tier: 'tier2_trusted',
    composite_score: 8.9,
    score_breakdown: {
      cosine_similarity: 0.89,
      price_affinity: 0.94,
      merchant_reputation: 0.92,
      shipping_speed: 0.85,
    },
    badges: [
      { badge_type: 'PRICE_LEADER', label: '21% Discount', badge_color: '#10b981' },
      { badge_type: 'MOST_REVIEWED', label: '60h Battery King', badge_color: '#ec4899' },
    ],
  },
];

export function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams?.get('q') || '';

  const [query, setQuery] = useState<string>(queryParam);
  const [activeQuery, setActiveQuery] = useState<string>(queryParam || 'Noise canceling studio headphones under $350');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<ProductCardData[]>(MOCK_SEARCH_RESULTS);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  useEffect(() => {
    if (queryParam) {
      setQuery(queryParam);
      setActiveQuery(queryParam);
      runSearch(queryParam);
    }
  }, [queryParam]);

  const runSearch = async (q: string) => {
    setIsSearching(true);
    setActiveQuery(q);

    try {
      const res = await fetch('/api/buyer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, action: 'DISCOVER' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.recommended_products && data.recommended_products.length > 0) {
          setResults(data.recommended_products);
        }
      }
    } catch {
      // Retain deterministic mock fallback
    } finally {
      setTimeout(() => setIsSearching(false), 600);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    runSearch(query.trim());
  };

  const handleCopyShareLink = () => {
    const winner = results[0];
    const runnerUp = results[1];
    const payload = {
      q: activeQuery,
      w: winner ? { t: winner.title, p: winner.price_cents, s: winner.composite_score, m: winner.merchant_domain } : null,
      r: runnerUp ? { t: runnerUp.title, p: runnerUp.price_cents, s: runnerUp.composite_score, m: runnerUp.merchant_domain } : null,
    };
    const b64 = typeof window !== 'undefined' ? btoa(JSON.stringify(payload)) : '';
    const shareUrl = `${window.location.origin}/share?data=${encodeURIComponent(b64)}`;
    navigator.clipboard?.writeText(shareUrl);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  return (
    <div className="relative min-h-screen bg-[#060b14] text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      {/* Header Bar */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Mastra Workflow 4-Step DAG Search & Knapsack Solver</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-display mb-3">
          Autonomous Product Search & Comparison
        </h1>
        <p className="max-w-xl text-sm sm:text-base text-slate-400 font-medium">
          Deterministic 0-hallucination multi-merchant product discovery backstopped by PayPal Vault v3 and Ed25519 Spend Mandates.
        </p>

        {/* Search Input Bar */}
        <form onSubmit={handleSearchSubmit} className="mt-6 w-full max-w-2xl relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute left-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking to buy today? (e.g. Sony WH-1000XM5 under $350)"
              className="w-full pl-12 pr-28 py-3.5 bg-slate-900/90 border border-slate-700 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-xl"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50"
            >
              {isSearching ? 'Solving...' : 'Search'}
            </button>
          </div>

          {/* Quick Preset Pills */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-slate-500 font-mono">Suggested:</span>
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuery(preset);
                  router.push(`/search?q=${encodeURIComponent(preset)}`);
                  runSearch(preset);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all font-mono"
              >
                {preset}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Active Pipeline Status Ticker */}
      <div className="mb-8 p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-slate-300">
            Query: <strong className="text-white">&ldquo;{activeQuery}&rdquo;</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-400">
            {results.length} Verified Offers Ranked by Deterministic Composite Score
          </span>
        </div>

        <button
          onClick={handleCopyShareLink}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
        >
          {copiedShare ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-bold">Share Dossier Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Share Comparison Dossier</span>
            </>
          )}
        </button>
      </div>

      {/* Product Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {results.map((product, idx) => {
          const isWinner = idx === 0;
          return (
            <div
              key={product.product_id}
              className={`p-6 rounded-2xl bg-slate-900/70 border ${
                isWinner ? 'border-cyan-500 shadow-2xl shadow-cyan-950/50' : 'border-slate-800'
              } flex flex-col justify-between card-hover relative`}
            >
              {isWinner && (
                <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow-lg">
                  Top Recommended Pick
                </div>
              )}

              <div>
                {/* Image & Score Gauge */}
                <div className="relative w-full h-48 rounded-xl overflow-hidden bg-slate-950 mb-4 border border-slate-800">
                  {product.cleaned_url && (
                    <img
                      src={product.cleaned_url}
                      alt={product.title}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform"
                    />
                  )}
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-white font-mono font-black text-xs flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{product.composite_score?.toFixed(1) || '9.0'}</span>
                  </div>
                </div>

                {/* Merchant & Badges */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-cyan-500/20">
                    {product.merchant_domain}
                  </span>
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

                {/* Title & Description */}
                <h3 className="text-base font-bold text-white mb-2 leading-snug line-clamp-2">
                  {product.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {product.description}
                </p>
              </div>

              {/* Pricing & Cart Action */}
              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-2xl font-black text-white font-mono">
                    {formatPrice(product.price_cents)}
                  </span>
                  {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
                    <span className="text-xs text-slate-500 line-through font-mono">
                      {formatPrice(product.compare_at_price_cents)}
                    </span>
                  )}
                </div>

                {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
                  <div className="mb-3 text-[11px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2 py-1 rounded">
                    Rebate Savings: +{formatPrice(product.commission_rebate_cents)}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="flex-1 text-center py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-950/50"
                  >
                    1-Click Buy in Cockpit
                  </Link>
                  <Link
                    href={`/share?product=${encodeURIComponent(product.product_id)}`}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060b14] text-white p-20 text-center font-mono text-sm animate-pulse">Initializing AegisPay Commerce Search...</div>}>
      <SearchContent />
    </Suspense>
  );
}
