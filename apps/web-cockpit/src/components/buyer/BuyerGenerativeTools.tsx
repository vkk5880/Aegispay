'use client';

import React, { createContext, useContext, useState } from 'react';
import { makeAssistantToolUI } from '@assistant-ui/react';
import type {
  ProductCardData,
  ComparisonMatrix,
  ShoppingActionType,
  SearchCatalogInput,
  SearchCatalogOutput,
  FilterTurnProductsInput,
  FilterTurnProductsOutput,
  CompareProductsInput,
  CompareProductsOutput,
  PrepareCheckoutInput,
  PrepareCheckoutOutput,
} from '@aegispay/shared-types';
import {
  Sparkles,
  Scale,
  ShieldCheck,
  Truck,
  ArrowRight,
  Zap,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { BattleArena } from './BattleArena';
import { PurchaseConfirmationCard } from './PurchaseConfirmationCard';

// --- Buyer Tool Callbacks Context ---

export interface BuyerToolCallbacks {
  selectedProducts: ProductCardData[];
  onToggleSelectProduct: (product: ProductCardData) => void;
  onAskAi: (product: ProductCardData) => void;
  onAction: (action: ShoppingActionType, product: ProductCardData) => void;
  zipCode?: string;
  onViewFullCart?: () => void;
  onPurchaseConfirmed?: (result: { orderId: string; authorizedCents: number }) => void;
}

const BuyerToolCallbacksContext = createContext<BuyerToolCallbacks | null>(null);

export const BuyerToolCallbacksProvider = BuyerToolCallbacksContext.Provider;

export function useBuyerToolCallbacks(): BuyerToolCallbacks {
  const ctx = useContext(BuyerToolCallbacksContext);
  if (!ctx) {
    return {
      selectedProducts: [],
      onToggleSelectProduct: () => {},
      onAskAi: () => {},
      onAction: () => {},
      zipCode: '94016',
      onViewFullCart: () => {},
      onPurchaseConfirmed: () => {},
    };
  }
  return ctx;
}

// --- Generative Product Card Subcomponent with Interactive Action Chips ---

export interface GenerativeProductCardProps {
  product: ProductCardData;
  isSelected?: boolean;
  onToggleSelect?: (product: ProductCardData) => void;
  onAskAi?: (product: ProductCardData) => void;
  onAction: (action: ShoppingActionType, product: ProductCardData) => void;
}

export function GenerativeProductCard({
  product,
  isSelected = false,
  onToggleSelect,
  onAskAi,
  onAction,
}: GenerativeProductCardProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    product.selected_variant_id || product.variants?.[0]?.id || ''
  );
  const activeVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const activePriceCents = activeVariant?.price_cents ?? product.price_cents;
  const netCents = activePriceCents - (product.commission_rebate_cents || 0);

  return (
    <div
      className={`bg-white dark:bg-[#080f20] border rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group relative ${
        isSelected
          ? 'border-cyan-500 dark:border-cyan-400 ring-2 ring-cyan-500/40 bg-cyan-50/20 dark:bg-cyan-950/20 shadow-md shadow-cyan-500/10'
          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/40'
      }`}
    >
      {/* Product Image & Badges - Compact Small Image */}
      <div className="relative h-20 sm:h-22 aspect-video w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.cleaned_image_url || product.image_url}
          alt={product.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
        />

        {/* Selected Overlay Pill */}
        {isSelected && (
          <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-md bg-cyan-600/95 text-white text-[9px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs">
            <CheckCircle2 className="w-2.5 h-2.5 text-white" />
            <span>Selected</span>
          </div>
        )}

        {/* Badges Overlay */}
        <div className={`absolute ${isSelected ? 'top-6' : 'top-1.5'} left-1.5 flex flex-col gap-1 z-10 transition-all`}>
          {product.free_shipping && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/90 text-white text-[9px] font-bold shadow-xs flex items-center gap-1 backdrop-blur-xs">
              <Truck className="w-2 h-2" /> Free
            </span>
          )}
          {product.commission_rebate_cents > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-600/90 text-white text-[9px] font-bold shadow-xs backdrop-blur-xs">
              -{formatCents(product.commission_rebate_cents)}
            </span>
          )}
        </div>

        <div className="absolute top-1.5 right-1.5 z-10">
          <span className="px-1.5 py-0.5 rounded bg-slate-900/80 dark:bg-black/80 text-white text-[9px] font-mono backdrop-blur-xs flex items-center gap-1">
            <ShieldCheck className="w-2 h-2 text-emerald-400" />
            {product.merchant_credibility_score}%
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
        <div className="space-y-0.5">
          <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">
            {product.merchant_domain}
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-white text-xs line-clamp-1 leading-snug">
            {product.title}
          </h4>
        </div>

        {/* Phase 4 Variant Selection Chips */}
        {product.variants && product.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5" role="group" aria-label="Product variants">
            {product.variants.slice(0, 3).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedVariantId(v.id);
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all cursor-pointer ${
                  selectedVariantId === v.id
                    ? 'bg-cyan-500/25 text-cyan-800 dark:text-cyan-200 border border-cyan-500/60 font-bold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        {/* Pricing */}
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-baseline justify-between">
          <div>
            <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-mono">
              {formatCents(netCents)}
            </div>
            {product.commission_rebate_cents > 0 && (
              <div className="text-[9px] text-slate-400 line-through font-mono">
                {formatCents(product.price_cents)}
              </div>
            )}
          </div>

          <div className="text-right text-[10px] text-slate-500 dark:text-slate-400">
            <span>★ {product.rating}</span>
          </div>
        </div>

        {/* Phase 3 Action Chips */}
        <div className="grid grid-cols-3 gap-1 pt-0.5">
          {/* Multi-Select Toggle */}
          <button
            type="button"
            onClick={() => onToggleSelect && onToggleSelect(product)}
            className={`px-1 py-1 rounded text-[10px] font-semibold transition-all border flex items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
              isSelected
                ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border-cyan-500 font-bold shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 border-slate-200 dark:border-slate-700'
            }`}
            title={isSelected ? 'Remove from comparison' : 'Select for side-by-side comparison'}
          >
            <Scale className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" />
            <span>{isSelected ? 'Done' : 'Select'}</span>
          </button>

          {/* Single-Item Deep Dive */}
          <button
            type="button"
            onClick={() => (onAskAi ? onAskAi(product) : onAction('DETAILS', product))}
            className="px-1 py-1 rounded bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/15 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 text-[10px] font-semibold transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-0.5 cursor-pointer active:scale-95"
            title="Ask AI about specs"
          >
            <Sparkles className="w-2.5 h-2.5 text-cyan-500" />
            <span>Ask</span>
          </button>

          {/* Instant Buy */}
          <button
            type="button"
            onClick={() => onAction('BUY', product)}
            className="px-1 py-1 rounded bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-0.5 cursor-pointer active:scale-95"
            title="Instant 1-Click Buy"
          >
            <Zap className="w-2.5 h-2.5" />
            <span>Buy</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Side-by-side Comparison Matrix Component ---

export interface ComparisonMatrixCardProps {
  matrix: ComparisonMatrix;
  onAction: (action: ShoppingActionType, product: ProductCardData) => void;
}

export function ComparisonMatrixCard({ matrix, onAction }: ComparisonMatrixCardProps) {
  const products = matrix.products || [];

  return (
    <div className="bg-white dark:bg-[#070e1c] border border-cyan-500/30 rounded-xl overflow-hidden shadow-xs">
      <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            Side-by-Side Comparison Matrix
          </h4>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
          {products.length} Products Evaluated
        </span>
      </div>

      {matrix.rationale && (
        <div className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 border-b border-cyan-200/50 dark:border-cyan-500/20 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-700 dark:text-cyan-300">Winning Rationale: </strong>
            <span>{matrix.rationale}</span>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1222]">
              <th className="py-2.5 px-3 font-semibold text-slate-500 dark:text-slate-400 w-36">
                Feature / Spec
              </th>
              {products.map((p) => {
                const isWinner = p.product_id === matrix.winner_product_id;
                return (
                  <th
                    key={p.product_id}
                    className={`py-2.5 px-3 font-bold text-slate-900 dark:text-white min-w-[180px] ${
                      isWinner ? 'bg-cyan-500/10 border-l border-r border-cyan-500/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-1">{p.title}</span>
                      {isWinner && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-500/40 shrink-0">
                          Top Pick
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
            {matrix.rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                  {row.attribute}
                </td>
                {products.map((p) => {
                  const val = row.values[p.product_id] || '-';
                  const isHighlighted = row.highlighted_product_id === p.product_id;
                  const isWinner = p.product_id === matrix.winner_product_id;
                  return (
                    <td
                      key={p.product_id}
                      className={`py-2 px-3 text-[11.5px] ${
                        isHighlighted
                          ? 'font-bold text-cyan-600 dark:text-cyan-400'
                          : 'text-slate-700 dark:text-slate-300'
                      } ${isWinner ? 'bg-cyan-500/5 border-l border-r border-cyan-500/20' : ''}`}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1222]">
              <td className="py-2.5 px-3 font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                Instant Action
              </td>
              {products.map((p) => {
                const isWinner = p.product_id === matrix.winner_product_id;
                return (
                  <td
                    key={p.product_id}
                    className={`py-2.5 px-3 ${
                      isWinner ? 'bg-cyan-500/10 border-l border-r border-cyan-500/30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onAction('BUY', p)}
                      className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 ${
                        isWinner
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span>Buy for Me</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// --- assistant-ui Generative Tool Visualizers ---

/**
 * 1. search_catalog Tool UI
 * Renders loading skeleton while querying Channel3, and interactive ProductCard grid upon result.
 */
export const SearchCatalogToolUI = makeAssistantToolUI<SearchCatalogInput, SearchCatalogOutput>({
  toolName: 'search_catalog',
  render: ({ args, result, status }) => {
    const { selectedProducts, onToggleSelectProduct, onAskAi, onAction } = useBuyerToolCallbacks();
    const isRunning = Boolean((status as any)?.type === 'running' || !result);
    const query = args?.query || 'catalog search';

    if (isRunning) {
      return (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 my-2 animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>
                Searching Channel3 Catalog for: <strong>"{query}"</strong>...
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              PAYPAL-HACKATHON-2026
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40" />
            ))}
          </div>
        </div>
      );
    }

    const products = result?.products || [];
    const promoCode = (result as any)?.promo_code || 'PAYPAL-HACKATHON-2026';
    return (
      <div className="my-2 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Discovered {products.length} catalog items</span>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">Promo: {promoCode}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {products.map((product) => (
            <GenerativeProductCard
              key={product.product_id}
              product={product}
              isSelected={selectedProducts.some((p) => p.product_id === product.product_id)}
              onToggleSelect={onToggleSelectProduct}
              onAskAi={onAskAi}
              onAction={onAction}
            />
          ))}
        </div>
      </div>
    );
  },
});

/**
 * 1b. discover_products Tool UI (Alternative tool name from Mastra discover tool)
 * Renders interactive Channel3 product cards with selection checkbox, specs deep dive, and buy action.
 */
export const DiscoverProductsToolUI = makeAssistantToolUI<SearchCatalogInput, SearchCatalogOutput>({
  toolName: 'discover_products',
  render: ({ args, result, status }) => {
    const { selectedProducts, onToggleSelectProduct, onAskAi, onAction } = useBuyerToolCallbacks();
    const isRunning = Boolean((status as any)?.type === 'running' || !result);
    const query = args?.query || 'catalog search';

    if (isRunning) {
      return (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 my-2 animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>
                Searching Channel3 Catalog for: <strong>"{query}"</strong>...
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              PAYPAL-HACKATHON-2026
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40" />
            ))}
          </div>
        </div>
      );
    }

    const products = result?.products || [];
    const promoCode = (result as any)?.promo_code || 'PAYPAL-HACKATHON-2026';
    return (
      <div className="my-2 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Discovered {products.length} catalog items</span>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">Promo: {promoCode}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {products.map((product) => (
            <GenerativeProductCard
              key={product.product_id}
              product={product}
              isSelected={selectedProducts.some((p) => p.product_id === product.product_id)}
              onToggleSelect={onToggleSelectProduct}
              onAskAi={onAskAi}
              onAction={onAction}
            />
          ))}
        </div>
      </div>
    );
  },
});

/**
 * 2. filter_turn_products Tool UI
 * Renders in-memory filtered product slice with filter metric pill.
 */
export const FilterTurnProductsToolUI = makeAssistantToolUI<FilterTurnProductsInput, FilterTurnProductsOutput>({
  toolName: 'filter_turn_products',
  render: ({ args, result, status }) => {
    const { selectedProducts, onToggleSelectProduct, onAskAi, onAction } = useBuyerToolCallbacks();
    const isRunning = Boolean((status as any)?.type === 'running' || !result);
    const criteria = args?.criteria || 'active items';

    if (isRunning) {
      return (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 my-2 animate-pulse flex items-center gap-2 text-cyan-400 text-xs font-mono">
          <Clock className="w-4 h-4 animate-spin" />
          <span>Applying sub-2ms in-memory turn filters ({criteria})...</span>
        </div>
      );
    }

    const products = result?.products || [];
    return (
      <div className="my-2 space-y-2">
        <div className="p-2 rounded-lg bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-500/30 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 font-mono text-[11px]">
            <Layers className="w-3.5 h-3.5" />
            <span>
              Filtered <strong>{result?.filtered_count ?? products.length}</strong> item(s) in-memory (&lt;2ms)
              {result?.applied_criteria ? ` matching "${result.applied_criteria}"` : ''}
            </span>
          </div>
          {args?.sort_by && (
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              Sort: {args.sort_by}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {products.map((product) => (
            <GenerativeProductCard
              key={product.product_id}
              product={product}
              isSelected={selectedProducts.some((p) => p.product_id === product.product_id)}
              onToggleSelect={onToggleSelectProduct}
              onAskAi={onAskAi}
              onAction={onAction}
            />
          ))}
        </div>
      </div>
    );
  },
});

/**
 * 3. compare_products Tool UI
 * Renders BattleArena head-to-head comparison and full spec matrix.
 */
export const CompareProductsToolUI = makeAssistantToolUI<CompareProductsInput, CompareProductsOutput>({
  toolName: 'compare_products',
  render: ({ args, result, status }) => {
    const { onAction } = useBuyerToolCallbacks();
    const isRunning = Boolean((status as any)?.type === 'running' || !result);
    const productCount = args?.product_ids?.length || 2;

    if (isRunning) {
      return (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 my-2 animate-pulse space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
            <Scale className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Evaluating {productCount} contenders side-by-side...</span>
          </div>
          <div className="h-32 rounded-lg bg-slate-800/40 border border-slate-700/40" />
        </div>
      );
    }

    const comparison = result?.comparison || ({} as any);
    const contenders = result?.products || comparison?.products || [];
    const winnerId = result?.winner_product_id || comparison?.winner_product_id;
    const winner = contenders.find((c: any) => c.product_id === winnerId) || contenders[0] || null;

    return (
      <div className="my-2 space-y-3">
        {/* Battle Arena Visualizer */}
        {contenders.length > 0 && winner && (
          <BattleArena
            contenders={contenders}
            winner={winner}
            battleReport={comparison?.rationale || (result as any)?.reason || null}
            onSelectWinner={(winProd) => onAction('BUY', winProd)}
          />
        )}

        {/* Detailed Spec Comparison Table */}
        {comparison && <ComparisonMatrixCard matrix={comparison} onAction={onAction} />}
      </div>
    );
  },
});

/**
 * 4. prepare_checkout Tool UI
 * Renders PurchaseConfirmationCard with stock reservation hold & official PayPal Smart Button mount.
 */
export const PrepareCheckoutToolUI = makeAssistantToolUI<PrepareCheckoutInput, PrepareCheckoutOutput>({
  toolName: 'prepare_checkout',
  render: ({ args, result, status }) => {
    const { zipCode, onViewFullCart, onPurchaseConfirmed, onAction } = useBuyerToolCallbacks();
    const isRunning = Boolean((status as any)?.type === 'running' || !result);

    if (isRunning) {
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 my-2 animate-pulse space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
            <ShieldCheck className="w-4 h-4 animate-spin" />
            <span>Verifying 2PC merchant stock hold and locking physical inventory...</span>
          </div>
          <div className="text-[11px] text-slate-400">Enforcing quantity bound (1 &lt;= qty &lt;= 5) & spend cap</div>
        </div>
      );
    }

    const prod = result?.product;
    const qty = args?.quantity || 1;
    const unitPrice = prod?.price_cents || Math.round((result?.total_expenditure_cents || 10000) / qty);
    const rebateCents = (prod?.commission_rebate_cents || Math.round(unitPrice * 0.1)) * qty;
    const shippingCents = prod?.free_shipping ? 0 : 500;
    const grossSubtotalCents = unitPrice * qty;
    const taxCents = Math.round(grossSubtotalCents * 0.0825);
    const netCents = result?.total_expenditure_cents || grossSubtotalCents - rebateCents + shippingCents + taxCents;

    const cart = (result?.cart as any)?.assigned_merchants
      ? (result?.cart as any)
      : {
          gross_subtotal_cents: grossSubtotalCents,
          total_commission_rebate_cents: rebateCents,
          total_shipping_cents: shippingCents,
          total_shipping_saved_cents: 0,
          total_tax_cents: taxCents,
          net_buyer_expenditure_cents: netCents,
          budget_cap_cents: args?.budget_cap_cents || 50000,
          is_within_budget: true,
          assigned_merchants: [
            {
              merchant_domain: prod?.merchant_domain || 'verified-merchant.com',
              merchant_name: prod?.merchant_domain || 'Verified Merchant',
              shipping_fee_cents: shippingCents,
              waiver_threshold_cents: 5000,
              shipping_waived: Boolean(prod?.free_shipping),
              commission_rebate_cents: rebateCents,
              tax_cents: taxCents,
              items: [
                {
                  product_id: prod?.product_id || args?.product_id || 'prod_unknown',
                  title: prod?.title || 'Selected Product',
                  price_cents: unitPrice,
                  unit_price_cents: unitPrice,
                  unit_compare_price_cents: prod?.compare_at_price_cents || unitPrice,
                  commission_rate: prod?.commission_rate || 0.1,
                  quantity: qty,
                  cleaned_url: prod?.cleaned_image_url || prod?.image_url || '',
                  shipping_fee_cents: shippingCents,
                },
              ],
            },
          ],
        };

    return (
      <div className="my-2">
        <PurchaseConfirmationCard
          cart={cart}
          zipCode={zipCode || '94016'}
          onViewFullCart={onViewFullCart}
          onConfirmPurchase={(confResult) => {
            if (onPurchaseConfirmed) {
              onPurchaseConfirmed({
                orderId: confResult.orderId,
                authorizedCents: confResult.authorizedCents,
              });
            }
          }}
        />

        {/* Phase 5 Proactive 1-Tap Recovery Pills */}
        {result.recovery_pills && result.recovery_pills.length > 0 && (
          <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-500 dark:text-amber-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Suggested 1-Tap Recovery Actions:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.recovery_pills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() =>
                    onAction('DISCOVER', {
                      product_id: pill.product_id || '',
                      title: pill.message_prompt,
                    } as any)
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-medium cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                >
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
});
