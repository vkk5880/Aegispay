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
  Check,
  Clock,
  Layers,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { getProductImageUrl } from '@/lib/productImageHelper';
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
    product?.selected_variant_id || product?.variants?.[0]?.id || ''
  );
  const activeVariant = product?.variants?.find((v) => v.id === selectedVariantId);
  const activePriceCents = activeVariant?.price_cents ?? product?.price_cents ?? 0;
  const netCents = activePriceCents - (product?.commission_rebate_cents || 0);

  return (
    <div
      className={`bg-white dark:bg-[#080f20] border rounded-xl overflow-hidden shadow-2xs hover:shadow-xs transition-all flex flex-row items-center p-2 sm:p-2.5 gap-2 sm:gap-2.5 group relative w-full min-w-0 max-w-full ${
        isSelected
          ? 'border-cyan-500 dark:border-cyan-400 ring-2 ring-cyan-500/30 bg-cyan-50/20 dark:bg-cyan-950/20'
          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/40'
      }`}
    >
      {/* Product Image - Small Square on the Left */}
      <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-100 dark:bg-slate-900 overflow-hidden shrink-0 border border-slate-200/70 dark:border-slate-800/70">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getProductImageUrl(product)}
          alt={product?.title || 'Product'}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
        {product?.free_shipping && (
          <span className="absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-600/90 text-white text-[8px] font-bold">
            Free
          </span>
        )}
      </div>

      {/* Information & Actions on the Right */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 space-y-1">
        {/* Top Header: Domain & Select Box with Tickmark */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 truncate max-w-[120px] sm:max-w-[140px]">
            {product?.merchant_domain}
          </span>

          {/* Select Box with Tickmark */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(product);
            }}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isSelected
                ? 'bg-cyan-600 border-cyan-600 text-white shadow-2xs ring-1 ring-cyan-500'
                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30'
            }`}
            title={isSelected ? 'Deselect product' : 'Select product for comparison'}
            aria-label={isSelected ? `Deselect ${product?.title}` : `Select ${product?.title}`}
          >
            <Check className={`w-3.5 h-3.5 stroke-[2.5] ${isSelected ? 'text-white' : 'opacity-0'}`} />
          </button>
        </div>

        {/* Title */}
        <h4
          className="font-semibold text-slate-900 dark:text-white text-xs line-clamp-1 leading-snug"
          title={product?.title}
        >
          {product?.title}
        </h4>

        {/* Pricing & Rating */}
        <div className="flex items-baseline justify-between gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-mono">
              {formatCents(netCents)}
            </span>
            {(product?.commission_rebate_cents || 0) > 0 && (
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                -{formatCents(product.commission_rebate_cents)}
              </span>
            )}
            {(product?.commission_rebate_cents || 0) > 0 && (
              <span className="text-[9px] text-slate-400 line-through font-mono hidden sm:inline">
                {formatCents(activePriceCents)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-amber-500 font-semibold shrink-0">
            ★ {product?.rating || '4.5'}
          </span>
        </div>

        {/* Bottom Actions: Ask & Buy */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => (onAskAi ? onAskAi(product) : onAction('DETAILS', product))}
            className="flex-1 py-1 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800/90 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 text-[10px] font-semibold border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
            title="Ask AI about specs"
          >
            <Sparkles className="w-2.5 h-2.5 text-cyan-500" />
            <span>Ask</span>
          </button>

          <button
            type="button"
            onClick={() => onAction('BUY', product)}
            className="flex-1 py-1 px-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] font-bold shadow-2xs transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
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
  const products = Array.isArray(matrix?.products) ? matrix.products : [];

  // Safe rows extraction with dynamic attribute synthesis fallback
  let rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  if (rows.length === 0 && products.length > 0) {
    rows = [
      {
        attribute: 'Net Price',
        values: Object.fromEntries(
          products.map((p) => [
            p.product_id,
            formatCents(p.price_cents - (p.commission_rebate_cents || 0)),
          ])
        ),
      },
      {
        attribute: 'Instant Rebate',
        values: Object.fromEntries(
          products.map((p) => [
            p.product_id,
            p.commission_rebate_cents ? `-${formatCents(p.commission_rebate_cents)}` : '$0.00',
          ])
        ),
      },
      {
        attribute: 'Original Price',
        values: Object.fromEntries(
          products.map((p) => [p.product_id, formatCents(p.price_cents)])
        ),
      },
      {
        attribute: 'Store / Domain',
        values: Object.fromEntries(
          products.map((p) => [p.product_id, p.merchant_domain || 'Merchant'])
        ),
      },
      {
        attribute: 'Rating',
        values: Object.fromEntries(
          products.map((p) => [p.product_id, `★ ${p.rating || '4.5'}`])
        ),
      },
      {
        attribute: 'Shipping',
        values: Object.fromEntries(
          products.map((p) => [p.product_id, p.free_shipping ? 'Free Shipping' : 'Standard'])
        ),
      },
    ];
  }

  const [isMinimized, setIsMinimized] = useState(false);

  if (isMinimized) {
    return (
      <div className="bg-white dark:bg-[#070e1c] border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between text-xs shadow-xs transition-all">
        <div className="flex items-center gap-2 truncate">
          <Scale className="w-4 h-4 text-cyan-500 shrink-0" />
          <span className="font-bold text-slate-900 dark:text-white">
            Comparison Matrix ({products.length} products)
          </span>
          {matrix?.winner_product_id && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[9px] font-bold">
              Top Pick Identified
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 cursor-pointer shadow-2xs"
        >
          <span>Expand Matrix</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#070e1c] border border-cyan-500/30 rounded-xl overflow-hidden shadow-xs">
      <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            Side-by-Side Comparison Matrix
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
            {products.length} Products Evaluated
          </span>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
            title="Slide to min"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {matrix?.rationale && (
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
                const isWinner = p.product_id === matrix?.winner_product_id;
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
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                  {row.attribute}
                </td>
                {products.map((p) => {
                  const val = row?.values?.[p.product_id] ?? '-';
                  const isHighlighted = row?.highlighted_product_id === p.product_id;
                  const isWinner = p.product_id === matrix?.winner_product_id;
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
                const isWinner = p.product_id === matrix?.winner_product_id;
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

// --- Side-by-Side Product Columns Component (Direct 2-to-4 Column Comparison Table) ---

export interface SideBySideProductColumnsProps {
  products: ProductCardData[];
  onBuy: (product: ProductCardData) => void;
  onRemove?: (productId: string) => void;
}

export function SideBySideProductColumns({
  products,
  onBuy,
  onRemove,
}: SideBySideProductColumnsProps) {
  const safeProducts = (products || [])
    .filter((p): p is ProductCardData => Boolean(p && typeof p === 'object' && p.product_id))
    .slice(0, 4);

  if (safeProducts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080f20] p-4 text-center text-xs text-slate-500">
        <Scale className="w-5 h-5 mx-auto mb-1 text-slate-400" />
        <span>Select 2 or more products from the chat to compare side-by-side</span>
      </div>
    );
  }

  // Extract unique spec attributes dynamically from products
  const specKeys = Array.from(
    new Set(
      safeProducts.flatMap((p) =>
        p.specs && typeof p.specs === 'object' ? Object.keys(p.specs) : []
      )
    )
  ).slice(0, 5);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#080f20] overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#060c18]">
              <th className="py-2.5 px-2 font-semibold text-slate-500 dark:text-slate-400 text-[11px] w-24 shrink-0">
                Item
              </th>
              {safeProducts.map((p, idx) => (
                <th
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center align-top min-w-[125px] border-l border-slate-200 dark:border-slate-800"
                >
                  <div className="flex flex-col items-center gap-1 relative">
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(p.product_id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-rose-500 hover:text-white text-slate-500 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                        title="Remove product"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getProductImageUrl(p)}
                      alt={p.title || 'Product'}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-2xs"
                    />
                    <div className="font-semibold text-slate-900 dark:text-white text-[11px] line-clamp-2 text-center leading-tight">
                      {p.title}
                    </div>
                    <span className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 truncate max-w-[110px]">
                      {p.merchant_domain}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
            {/* Final Net Price */}
            <tr className="bg-cyan-50/20 dark:bg-cyan-950/20">
              <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                Net Price
              </td>
              {safeProducts.map((p, idx) => {
                const netCents = p.price_cents - (p.commission_rebate_cents || 0);
                return (
                  <td
                    key={p.product_id || idx}
                    className="py-2 px-2 text-center border-l border-slate-200 dark:border-slate-800"
                  >
                    <span className="font-black font-mono text-cyan-600 dark:text-cyan-400 text-xs sm:text-sm">
                      {formatCents(netCents)}
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* Original Price */}
            <tr>
              <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                Original Price
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center text-[11px] font-mono text-slate-400 line-through border-l border-slate-200 dark:border-slate-800"
                >
                  {formatCents(p.price_cents)}
                </td>
              ))}
            </tr>

            {/* Instant Rebate */}
            <tr>
              <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                Cashback
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 border-l border-slate-200 dark:border-slate-800"
                >
                  {p.commission_rebate_cents ? `-${formatCents(p.commission_rebate_cents)}` : '$0.00'}
                </td>
              ))}
            </tr>

            {/* Rating */}
            <tr>
              <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                Rating
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center text-[11px] text-amber-500 font-semibold border-l border-slate-200 dark:border-slate-800"
                >
                  ★ {p.rating || '4.5'}
                </td>
              ))}
            </tr>

            {/* Shipping */}
            <tr>
              <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                Shipping
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center text-[11px] font-medium border-l border-slate-200 dark:border-slate-800"
                >
                  {p.free_shipping ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Free</span>
                  ) : (
                    <span className="text-slate-500">$5.00</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Trust Score */}
            <tr>
              <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                Store Trust
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 text-center text-[11px] font-mono text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800"
                >
                  {p.merchant_credibility_score || 95}%
                </td>
              ))}
            </tr>

            {/* Dynamic Specification Rows if available */}
            {specKeys.map((key) => (
              <tr key={key}>
                <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400 text-[11px] capitalize truncate max-w-[90px]">
                  {key.replace(/_/g, ' ')}
                </td>
                {safeProducts.map((p, idx) => {
                  const specVal = p.specs?.[key] ? String(p.specs[key]) : '-';
                  return (
                    <td
                      key={p.product_id || idx}
                      className="py-2 px-2 text-center text-[11px] text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800 truncate max-w-[120px]"
                      title={specVal}
                    >
                      {specVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#060c18]">
              <td className="py-2 px-2 font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                Action
              </td>
              {safeProducts.map((p, idx) => (
                <td
                  key={p.product_id || idx}
                  className="py-2 px-2 border-l border-slate-200 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => onBuy(p)}
                    className="w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-[11px] shadow-2xs flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95"
                  >
                    <span>Buy for Me</span>
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// --- assistant-ui Generative Tool Visualizers ---

export function CollapsibleProductCatalogView({
  products,
  promoCode,
  query,
}: {
  products: ProductCardData[];
  promoCode?: string;
  query?: string;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const { selectedProducts, onToggleSelectProduct, onAskAi, onAction } = useBuyerToolCallbacks();

  if (isMinimized) {
    return (
      <div className="my-2 p-2.5 rounded-xl bg-slate-100/90 dark:bg-[#070e1c] border border-cyan-500/30 flex items-center justify-between text-xs shadow-xs transition-all">
        <div className="flex items-center gap-2 min-w-0 truncate">
          <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-white truncate">
            {products.length} Products Found
          </span>
          {query && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate hidden sm:inline">
              for "{query}"
            </span>
          )}
          {promoCode && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hidden md:inline">
              {promoCode}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors shrink-0"
        >
          <span>View Products</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="my-2 space-y-2 w-full min-w-0 max-w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="truncate">Discovered {products.length} catalog items</span>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold shrink-0">• Promo: {promoCode}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer shrink-0"
          title="Minimize product grid"
        >
          <span>Slide to min</span>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 w-full min-w-0 max-w-full">
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
}

/**
 * 1. search_catalog Tool UI
 * Renders loading skeleton while querying Channel3, and interactive ProductCard grid upon result.
 */
export const SearchCatalogToolUI = makeAssistantToolUI<SearchCatalogInput, SearchCatalogOutput>({
  toolName: 'search_catalog',
  render: ({ args, result, status }) => {
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

    const products = Array.isArray(result?.products) ? result.products : [];
    const promoCode = (result as any)?.promo_code || 'PAYPAL-HACKATHON-2026';
    return (
      <CollapsibleProductCatalogView
        products={products}
        promoCode={promoCode}
        query={query}
      />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40" />
            ))}
          </div>
        </div>
      );
    }

    const products = Array.isArray(result?.products) ? result.products : [];
    const promoCode = (result as any)?.promo_code || 'PAYPAL-HACKATHON-2026';
    return (
      <CollapsibleProductCatalogView
        products={products}
        promoCode={promoCode}
        query={query}
      />
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

    const products = Array.isArray(result?.products) ? result.products : [];
    return (
      <div className="my-2 space-y-2 w-full min-w-0 max-w-full">
        <div className="p-2 rounded-lg bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-500/30 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 font-mono text-[11px] min-w-0 truncate">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Filtered <strong>{result?.filtered_count ?? products.length}</strong> item(s) in-memory (&lt;2ms)
              {result?.applied_criteria ? ` matching "${result.applied_criteria}"` : ''}
            </span>
          </div>
          {args?.sort_by && (
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
              Sort: {args.sort_by}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 w-full min-w-0 max-w-full">
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
    const contenders = Array.isArray(result?.products)
      ? result.products
      : Array.isArray(comparison?.products)
      ? comparison.products
      : [];
    const winnerId = result?.winner_product_id || comparison?.winner_product_id;
    const winner = contenders.find((c: any) => c.product_id === winnerId) || contenders[0] || null;

    return (
      <div className="my-2 space-y-3">
        {/* Direct Side-by-Side Table Comparison */}
        {contenders.length >= 2 ? (
          <SideBySideProductColumns
            products={contenders}
            onBuy={(winProd) => onAction('BUY', winProd)}
          />
        ) : contenders.length > 0 && winner ? (
          <BattleArena
            contenders={contenders}
            winner={winner}
            battleReport={null}
            onSelectWinner={(winProd) => onAction('BUY', winProd)}
          />
        ) : null}

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
        {Array.isArray(result?.recovery_pills) && result.recovery_pills.length > 0 && (
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
