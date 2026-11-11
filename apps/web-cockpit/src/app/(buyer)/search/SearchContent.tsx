'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Sparkles,
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
  PackageSearch,
  Bookmark,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { useMounted } from '@/hooks/useMounted';
import { useUiMode } from '@/context/UiModeContext';

const PRESET_QUERIES = [
  'Noise canceling studio headphones under $350',
  'Wireless ergonomic mechanical keyboard',
  '4K USB-C gaming & productivity monitor',
  'Anker high-capacity power bank with fast charging',
];

const INITIAL_PREVIEW_PRODUCTS: ProductCardData[] = [
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
    delivery_window: '2-3 Business Days',
    rating: 4.8,
    review_count: 120,
    free_shipping: true,
    merchant_credibility_score: 98,
    store_tier: 'tier1_official',
    composite_score: 9.4,
    score_breakdown: {
      cosine_similarity: 0.95,
      price_affinity: 0.88,
      merchant_reputation: 0.98,
      shipping_speed: 0.95,
    },
    badges: [
      { badge_type: 'BEST_VALUE', label: 'Best Overall Pick', badge_color: '#06b6d4', color: '#06b6d4' },
      { badge_type: 'PRICE_LEADER', label: '13% Below MSRP', badge_color: '#10b981', color: '#10b981' },
      { badge_type: 'TOP_RATED', label: '4.8 ★ Verified', badge_color: '#8b5cf6', color: '#8b5cf6' },
    ],
  },
];

export function SearchContent({
  initialResults = INITIAL_PREVIEW_PRODUCTS,
}: {
  initialResults?: ProductCardData[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mounted = useMounted();
  const { showTechnicalDetails } = useUiMode();
  const queryParam = searchParams?.get('q') || '';

  const [query, setQuery] = useState<string>(queryParam);
  const [activeQuery, setActiveQuery] = useState<string>(queryParam || 'Noise canceling studio headphones under $350');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<ProductCardData[]>(initialResults);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  const handleSaveToWatchlist = async (product: ProductCardData) => {
    setSavedIds((prev) => ({ ...prev, [product.product_id]: true }));
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
    } catch {
      // Local feedback
    }
  };

  useEffect(() => {
    if (queryParam) {
      setQuery(queryParam);
      setActiveQuery(queryParam);
      runSearch(queryParam);
    } else {
      // Auto-fetch live Channel3 items on initial mount
      runSearch('Noise canceling studio headphones under $350');
    }
  }, [queryParam]);

  const runSearch = async (q: string) => {
    setIsSearching(true);
    setActiveQuery(q);

    try {
      const res = await fetch('/api/buyer/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-session': 'true',
        },
        body: JSON.stringify({ message: q, action: 'DISCOVER', stream: false }),
      });

      if (res.ok) {
        const data = await res.json();
        const incomingProducts: ProductCardData[] =
          (Array.isArray(data.products) && data.products.length > 0 && data.products) ||
          (Array.isArray(data.recommended_products) && data.recommended_products.length > 0 && data.recommended_products) ||
          [];
        setResults(incomingProducts);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    runSearch(query.trim());
  };

  const handleCopyShareLink = () => {
    if (typeof window === 'undefined' || !navigator.clipboard?.writeText) return;
    const winner = results[0];
    const runnerUp = results[1];
    const payload = {
      q: activeQuery,
      w: winner ? { t: winner.title, p: winner.price_cents, s: winner.composite_score, m: winner.merchant_domain } : null,
      r: runnerUp ? { t: runnerUp.title, p: runnerUp.price_cents, s: runnerUp.composite_score, m: runnerUp.merchant_domain } : null,
    };
    const b64 = btoa(JSON.stringify(payload));
    const shareUrl = `${window.location.origin}/share?data=${encodeURIComponent(b64)}`;
    navigator.clipboard.writeText(shareUrl);
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
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full transition-colors">
      {/* Header Bar */}
      <div className="mb-6 text-center flex flex-col items-center">
        <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/40 px-3 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {showTechnicalDetails
              ? 'Mastra Workflow 4-Step DAG Search & Knapsack Solver'
              : 'Smart Multi-Store Search & Savings Finder'}
          </span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display mb-2">
          {showTechnicalDetails
            ? 'Autonomous Product Search & Comparison'
            : 'Product Search & Price Comparison'}
        </h1>
        <p className="max-w-xl text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          {showTechnicalDetails
            ? 'Deterministic 0-hallucination multi-merchant product discovery backstopped by PayPal Vault v3 and Ed25519 Spend Mandates.'
            : 'Find the best deals across verified stores with automatic coupon savings and PayPal purchase protection.'}
        </p>

        {/* Search Input Bar */}
        <form onSubmit={handleSearchSubmit} className="mt-4 w-full max-w-2xl relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking to buy today? (e.g. Sony WH-1000XM5 under $350)"
              className="w-full pl-10 pr-24 py-2.5 bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-xs"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? (showTechnicalDetails ? 'Solving...' : 'Searching...') : 'Search'}
            </button>
          </div>

          {/* Quick Preset Pills */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-mono">Suggested:</span>
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuery(preset);
                  router.push(`/search?q=${encodeURIComponent(preset)}`);
                  runSearch(preset);
                }}
                className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 transition-all font-mono cursor-pointer shadow-2xs"
              >
                {preset}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Active Pipeline Status Ticker */}
      <div className="mb-6 p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <span className="text-slate-700 dark:text-slate-300 text-xs">
            {showTechnicalDetails ? 'Query:' : 'Looking for:'} <strong className="text-slate-900 dark:text-white">&ldquo;{activeQuery}&rdquo;</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-cyan-700 dark:text-cyan-400 text-xs font-semibold">
            {showTechnicalDetails
              ? `${results.length} Verified Offers Ranked by Deterministic Composite Score`
              : `${results.length} Verified Best Value Offers Found`}
          </span>
        </div>

        <button
          onClick={handleCopyShareLink}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
        >
          {copiedShare ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                {showTechnicalDetails ? 'Share Dossier Copied!' : 'Link Copied!'}
              </span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>{showTechnicalDetails ? 'Share Comparison Dossier' : 'Share Comparison'}</span>
            </>
          )}
        </button>
      </div>

      {/* Product Results Grid, Loading Skeleton, or Empty State - 3-4 responsive items */}
      {isSearching ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-3.5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="w-full h-32 sm:h-36 rounded-lg bg-slate-100 dark:bg-slate-800/60" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-16 bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-4 w-full bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800/40 rounded" />
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex justify-between items-center">
                <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-7 w-20 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center shadow-xs">
          <PackageSearch className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-2.5" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Matching Offers Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4">
            We couldn&apos;t locate active merchant stock matching &ldquo;{activeQuery}&rdquo;. Try another search term or click one of the suggested queries above.
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setQuery(preset);
                  router.push(`/search?q=${encodeURIComponent(preset)}`);
                  runSearch(preset);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all font-mono cursor-pointer shadow-2xs"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {results.map((product, idx) => {
            const isWinner = idx === 0;
            return (
              <div
                key={product.product_id}
                className={`p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#0c1424]/90 border transition-all duration-300 card-hover flex flex-col justify-between relative shadow-xs hover:shadow-md ${
                  isWinner ? 'border-cyan-500 shadow-cyan-500/10' : 'border-slate-200/90 dark:border-white/10'
                }`}
              >
                {isWinner && (
                  <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[9px] uppercase tracking-wider shadow-md">
                    Top Pick
                  </div>
                )}

                <div>
                  {/* Compact Image & Score Gauge */}
                  <div className="relative w-full h-32 sm:h-36 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 mb-2.5 border border-slate-200/80 dark:border-white/10">
                    {product.cleaned_url && (
                      <img
                        src={product.cleaned_url}
                        alt={product.title}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform"
                      />
                    )}
                    <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-white/90 dark:bg-black/80 backdrop-blur-md border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white font-mono font-bold text-[10px] flex items-center gap-1 shadow-2xs">
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span>{product.composite_score?.toFixed(1) || '9.0'}</span>
                    </div>
                  </div>

                  {/* Merchant & Badges */}
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                      {product.merchant_domain}
                    </span>
                    {product.badges?.slice(0, 1).map((b, bIdx) => {
                      const badgeColor = b.badge_color || b.color || '#06b6d4';
                      return (
                        <span
                          key={bIdx}
                          style={{ color: badgeColor, borderColor: `${badgeColor}40` }}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/5 border"
                        >
                          {b.label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-1 leading-snug line-clamp-2">
                    {product.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-2.5">
                    {product.description}
                  </p>
                </div>

                {/* Pricing & Cart Action */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
                      {formatPrice(product.price_cents)}
                    </span>
                    {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
                      <span className="text-[10px] text-slate-400 line-through font-mono">
                        {formatPrice(product.compare_at_price_cents)}
                      </span>
                    )}
                  </div>

                  {product.commission_rebate_cents && product.commission_rebate_cents > 0 && (
                    <div className="mb-2 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded">
                      {showTechnicalDetails
                        ? `Rebate: +${formatPrice(product.commission_rebate_cents)}`
                        : `Cashback: ${formatPrice(product.commission_rebate_cents)}`}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Link
                      href="/"
                      className="flex-1 text-center py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-xs"
                    >
                      {showTechnicalDetails ? '1-Click Buy in Cockpit' : '1-Click Buy with PayPal'}
                    </Link>
                    <Link
                      href={`/share?product=${encodeURIComponent(product.product_id)}`}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 transition-all shadow-2xs"
                      title="Share comparison"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleSaveToWatchlist(product)}
                      aria-label={savedIds[product.product_id] ? 'Saved to Watchlist' : 'Save to Watchlist'}
                      title={savedIds[product.product_id] ? 'Saved in Watchlist / Saved Items' : 'Save to Watchlist / Saved Items'}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                        savedIds[product.product_id]
                          ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/60 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${savedIds[product.product_id] ? 'fill-current text-cyan-600 dark:text-cyan-400' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
