'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';
import { useMounted } from '@/hooks/useMounted';
import { useUiMode } from '@/context/UiModeContext';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_50_SEARCH_PRODUCTS } from '@/lib/searchCatalog';
import { ProductImage } from '@/components/common/ProductImage';
import { ProductDetailModal } from '@/components/buyer/ProductDetailModal';

const PRESET_QUERIES = [
  'Noise canceling studio headphones under $350',
  'Wireless ergonomic mechanical keyboard',
  '4K USB-C gaming & productivity monitor',
  'Anker high-capacity power bank with fast charging',
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Categories' },
  { id: 'audio', label: 'Audio & Studio' },
  { id: 'computing', label: 'Laptops & Computing' },
  { id: 'visual', label: 'Cameras & Visual' },
  { id: 'mobile', label: 'Smartphones & Mobile' },
  { id: 'smart-home', label: 'Smart Home & Power' },
];

const INITIAL_PREVIEW_PRODUCTS: ProductCardData[] = DEFAULT_50_SEARCH_PRODUCTS;

export function SearchContent({
  initialResults = INITIAL_PREVIEW_PRODUCTS,
}: {
  initialResults?: ProductCardData[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mounted = useMounted();
  const { showTechnicalDetails } = useUiMode();
  const { addToCart, openCart } = useCart();
  const { user } = useAuth();
  const activeUserId = user?.email || (user as any)?.id || user?.name || 'sb-buyer@personal.example.com';
  const queryParam = searchParams?.get('q') || '';

  const [query, setQuery] = useState<string>(queryParam);
  const [activeQuery, setActiveQuery] = useState<string>(queryParam || 'All Products Catalog');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<ProductCardData[]>(initialResults);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'composite' | 'price_asc' | 'rebate_desc'>('composite');
  const [selectedProductForModal, setSelectedProductForModal] = useState<ProductCardData | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3200);
  };

  // Sync saved items from server on mount
  useEffect(() => {
    let isMounted = true;
    async function loadSavedItems() {
      try {
        const res = await fetch(`/api/buyer/watchlist?user_id=${encodeURIComponent(activeUserId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.watchlist)) {
            const map: Record<string, boolean> = {};
            for (const item of data.watchlist) {
              if (item.id) map[item.id] = true;
              if (item.query) map[item.query] = true;
              if (item.title) map[item.title] = true;
            }
            setSavedIds(map);
          }
        }
      } catch {
        // Silently preserve offline state
      }
    }
    loadSavedItems();
    return () => {
      isMounted = false;
    };
  }, [activeUserId]);

  const handleSaveToWatchlist = async (product: ProductCardData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isCurrentlySaved = Boolean(savedIds[product.product_id] || savedIds[product.title]);

    if (isCurrentlySaved) {
      // Optimistic remove
      setSavedIds((prev) => ({
        ...prev,
        [product.product_id]: false,
        [product.title]: false,
      }));
      showToast(`Removed "${product.title.slice(0, 32)}..." from Watchlist.`);

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
      // Optimistic save
      setSavedIds((prev) => ({
        ...prev,
        [product.product_id]: true,
        [product.title]: true,
      }));
      showToast(`Saved to Watchlist! Tracking price drops for "${product.title.slice(0, 32)}...".`);

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
        // Local fallback
      }
    }
  };

  const handleAddToCart = (product: ProductCardData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    addToCart(product, 1);
    setAddedIds((prev) => ({ ...prev, [product.product_id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [product.product_id]: false }));
    }, 2000);
  };

  const handleInstantBuy = (product: ProductCardData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    addToCart(product, 1);
    openCart();
  };

  useEffect(() => {
    if (queryParam) {
      setQuery(queryParam);
      setActiveQuery(queryParam);
      runSearch(queryParam);
    } else {
      // Preserve the 50 items catalog when no query is in URL
      setActiveQuery('All Products Catalog');
      setResults(initialResults);
    }
  }, [queryParam, initialResults]);

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
        body: JSON.stringify({ message: q, action: 'DISCOVER', stream: false, limit: 50 }),
      });

      if (res.ok) {
        const data = await res.json();
        const incomingProducts: ProductCardData[] =
          (Array.isArray(data.products) && data.products.length > 0 && data.products) ||
          (Array.isArray(data.recommended_products) && data.recommended_products.length > 0 && data.recommended_products) ||
          [];
        if (incomingProducts.length > 0) {
          setResults(incomingProducts);
        } else {
          const qLower = q.toLowerCase();
          const matched = DEFAULT_50_SEARCH_PRODUCTS.filter(
            (p) => p.title.toLowerCase().includes(qLower) || p.category_id.toLowerCase().includes(qLower)
          );
          setResults(matched.length > 0 ? matched : DEFAULT_50_SEARCH_PRODUCTS);
        }
      } else {
        setResults(DEFAULT_50_SEARCH_PRODUCTS);
      }
    } catch {
      setResults(DEFAULT_50_SEARCH_PRODUCTS);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      router.push('/search');
      setActiveQuery('All Products Catalog');
      setResults(initialResults);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    runSearch(query.trim());
  };

  const handleCopyShareLink = () => {
    if (typeof window === 'undefined' || !navigator.clipboard?.writeText) return;
    const winner = filteredResults[0] || results[0];
    const runnerUp = filteredResults[1] || results[1];
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

  // Filtered and sorted products
  const filteredResults = useMemo(() => {
    let list = results;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_id.toLowerCase() === selectedCategory.toLowerCase());
    }

    const sorted = [...list];
    if (sortBy === 'price_asc') {
      sorted.sort((a, b) => a.price_cents - b.price_cents);
    } else if (sortBy === 'rebate_desc') {
      sorted.sort((a, b) => (b.commission_rebate_cents || 0) - (a.commission_rebate_cents || 0));
    } else {
      sorted.sort((a, b) => (b.composite_score || 9.0) - (a.composite_score || 9.0));
    }
    return sorted;
  }, [results, selectedCategory, sortBy]);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full transition-colors">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 bg-cyan-950/95 border border-cyan-400 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in font-mono flex items-center gap-2">
          <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
          <span>{notification}</span>
        </div>
      )}

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

      {/* Category Pills & Sort Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-cyan-500 text-white shadow-xs'
                  : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:border-cyan-500"
          >
            <option value="composite">Best Match (AI Score)</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="rebate_desc">Highest Cashback</option>
          </select>
        </div>
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
              ? `${filteredResults.length} Verified Offers Ranked by Deterministic Composite Score`
              : `${filteredResults.length} Verified Best Value Offers Found`}
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

      {/* Product Results Grid, Loading Skeleton, or Empty State */}
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
      ) : filteredResults.length === 0 ? (
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
                type="button"
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
          {filteredResults.map((product, idx) => {
            const isWinner = idx === 0 && selectedCategory === 'all';
            const isAdded = Boolean(addedIds[product.product_id]);
            const isSaved = Boolean(savedIds[product.product_id] || savedIds[product.title]);

            return (
              <div
                key={product.product_id}
                className={`group p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#0c1424]/90 border transition-all duration-300 card-hover flex flex-col justify-between relative shadow-xs hover:shadow-lg ${
                  isWinner ? 'border-cyan-500 shadow-cyan-500/10' : 'border-slate-200/90 dark:border-white/10 hover:border-cyan-500/40'
                }`}
              >
                {isWinner && (
                  <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[9px] uppercase tracking-wider shadow-md z-10 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    <span>Top Pick</span>
                  </div>
                )}

                <div>
                  {/* Clickable Image Container */}
                  <div
                    onClick={() => setSelectedProductForModal(product)}
                    className="relative w-full h-32 sm:h-36 rounded-lg overflow-hidden bg-white dark:bg-slate-950 mb-2.5 border border-slate-200/80 dark:border-white/10 cursor-pointer group/img"
                    title="Click to view full specs"
                  >
                    <ProductImage product={product} alt={product.title} studioMode />

                    {/* Quick View Hover Pill */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white font-mono text-[10px] font-bold flex items-center gap-1.5 shadow-md">
                        <Eye className="w-3 h-3 text-cyan-500" />
                        <span>Quick View</span>
                      </span>
                    </div>

                    {/* AI Score Badge */}
                    <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-white/90 dark:bg-black/80 backdrop-blur-md border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white font-mono font-bold text-[10px] flex items-center gap-1 shadow-2xs">
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span>{product.composite_score?.toFixed(1) || '9.0'}</span>
                    </div>

                    {/* Stock Status Badge */}
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/85 backdrop-blur-md text-emerald-400 font-mono text-[9px] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>2PC In Stock</span>
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

                  {/* Clickable Title */}
                  <h3
                    onClick={() => setSelectedProductForModal(product)}
                    className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-1 leading-snug line-clamp-2 cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                  >
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
                    <div className="mb-2 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded flex items-center justify-between">
                      <span>{showTechnicalDetails ? 'Rebate:' : 'Cashback:'}</span>
                      <span className="font-bold">+{formatPrice(product.commission_rebate_cents)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleInstantBuy(product, e)}
                      className="flex-1 text-center py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      {showTechnicalDetails ? '1-Click Buy in Cockpit' : '1-Click Buy with PayPal'}
                    </button>

                    {/* Quick Add to Cart Button with Feedback */}
                    <button
                      type="button"
                      onClick={(e) => handleAddToCart(product, e)}
                      title={isAdded ? 'Added to Cart!' : 'Add to Cart'}
                      aria-label="Add to cart"
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                        isAdded
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isAdded ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <ShoppingBag className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      )}
                    </button>

                    {/* Open dedicated page link */}
                    <Link
                      href={`/products/${encodeURIComponent(product.product_id)}`}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 transition-all shadow-2xs"
                      title="Open full product page"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>

                    {/* Share Button */}
                    <Link
                      href={`/share?product=${encodeURIComponent(product.product_id)}`}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 transition-all shadow-2xs"
                      title="Share comparison"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Link>

                    {/* Watchlist Bookmark */}
                    <button
                      type="button"
                      onClick={(e) => handleSaveToWatchlist(product, e)}
                      aria-label={isSaved ? 'Saved to Watchlist' : 'Save to Watchlist'}
                      title={isSaved ? 'Saved in Watchlist / Saved Items' : 'Save to Watchlist / Saved Items'}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                        isSaved
                          ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/60 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-cyan-600 dark:text-cyan-400' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global In-Context Modal */}
      <ProductDetailModal
        product={selectedProductForModal}
        isOpen={Boolean(selectedProductForModal)}
        onClose={() => setSelectedProductForModal(null)}
        onInstantBuy={(p) => {
          setSelectedProductForModal(null);
          handleInstantBuy(p);
        }}
      />
    </div>
  );
}
