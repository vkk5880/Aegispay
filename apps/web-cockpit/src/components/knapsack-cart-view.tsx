'use client';

import React from 'react';
import {
  ShoppingBag,
  Store,
  Truck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
  Tag,
  DollarSign,
  TrendingDown,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface MultiMerchantCartItem {
  id: string;
  name?: string;
  title?: string;
  merchantDomain?: string;
  merchant_domain?: string;
  priceCents?: number;
  price_cents?: number;
  quantity?: number;
  rebateCents?: number;
  rebate_cents?: number;
  shippingWaived?: boolean;
  shipping_waived?: boolean;
  deliveryWindow?: string;
  delivery_window?: string;
}

export interface KnapsackCartViewProps {
  items?: MultiMerchantCartItem[];
  totalCents?: number;
  budgetCapCents?: number;
  totalRebateCents?: number;
  onCheckout?: () => void;
  loading?: boolean;
}

export function KnapsackCartView({
  items,
  totalCents,
  budgetCapCents = 35000,
  totalRebateCents,
  onCheckout,
  loading,
}: KnapsackCartViewProps) {
  const defaultItems: MultiMerchantCartItem[] = [
    {
      id: 'item_1',
      name: 'Anker Magnetic Wireless Power Bank (10,000mAh)',
      merchantDomain: 'anker.com',
      priceCents: 4999,
      quantity: 1,
      rebateCents: 375, // alpha = 0.75 rebate
      shippingWaived: true,
      deliveryWindow: '2-Day Express Consolidated',
    },
    {
      id: 'item_2',
      name: 'Keychron K2 V2 Wireless Mechanical Keyboard',
      merchantDomain: 'keychron.com',
      priceCents: 7999,
      quantity: 1,
      rebateCents: 600,
      shippingWaived: true,
      deliveryWindow: '2-Day Express Consolidated',
    },
    {
      id: 'item_3',
      name: 'Peak Design Tech Pouch (Charcoal)',
      merchantDomain: 'peakdesign.com',
      priceCents: 5995,
      quantity: 1,
      rebateCents: 450,
      shippingWaived: false,
      deliveryWindow: '3-4 Day Priority Freight',
    },
  ];

  const rawCartItems = items || defaultItems;

  // Normalize each item to support both camelCase and snake_case properties
  const cartItems = rawCartItems.map((item) => {
    const name = item.name || item.title || 'Product Item';
    const merchantDomain = (item.merchantDomain || item.merchant_domain || 'unassigned-merchant.com').trim().toLowerCase();
    const priceCents = Math.max(0, Number(item.priceCents ?? item.price_cents ?? 0));
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const rebateCents = Math.max(0, Number(item.rebateCents ?? item.rebate_cents ?? 0));
    const shippingWaived = Boolean(item.shippingWaived ?? item.shipping_waived ?? false);
    const deliveryWindow = item.deliveryWindow || item.delivery_window || '2-3 Business Days';

    return {
      ...item,
      name,
      merchantDomain,
      priceCents,
      quantity,
      rebateCents,
      shippingWaived,
      deliveryWindow,
    };
  });

  // Group items safely by merchant domain
  const groupedByMerchant = cartItems.reduce((acc, item) => {
    const domain = item.merchantDomain;
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(item);
    return acc;
  }, {} as Record<string, typeof cartItems>);

  // Compute calculated values or use overrides if explicitly passed
  const calculatedSubtotal = cartItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const calculatedTotalRebate = cartItems.reduce((sum, item) => sum + item.rebateCents * item.quantity, 0);

  const subtotalCents = totalCents !== undefined ? Math.max(0, Number(totalCents) || 0) : calculatedSubtotal;
  const appliedRebateCents = totalRebateCents !== undefined ? Math.max(0, Number(totalRebateCents) || 0) : calculatedTotalRebate;
  const netTotalCents = Math.max(0, subtotalCents - appliedRebateCents);

  // Budget comparison calculation
  const budgetCap = Math.max(0, Number(budgetCapCents) || 0);
  const budgetUtilization = budgetCap > 0 ? Math.min(100, Math.round((netTotalCents / budgetCap) * 100)) : 0;
  const isUnderBudget = budgetCap > 0 && netTotalCents <= budgetCap;

  if (cartItems.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0c1424] p-8 shadow-2xl text-center space-y-4">
        <div className="p-3 bg-cyan-950/60 border border-cyan-500/30 rounded-2xl text-cyan-400 w-fit mx-auto">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">Knapsack Cart is Empty</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Your autonomous multi-vendor knapsack optimization cart has no items. Run a buyer query in the chat flow to discover and bundle products.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0c1424] p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
              Multi-Merchant Knapsack Cart
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                α = 0.75 Affiliate Rebate
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {Object.keys(groupedByMerchant).length} verified merchant partitions with zero-click single payment token
            </p>
          </div>
        </div>

        {/* Budget Cap Indicator Pill */}
        {budgetCap > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#060b14] border border-slate-800 text-xs font-mono self-start sm:self-auto">
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Budget Cap:</span>
            <span className={`font-bold ${isUnderBudget ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formatCents(budgetCap)}
            </span>
          </div>
        )}
      </div>

      {/* Budget Utilization Bar */}
      {budgetCap > 0 && (
        <div className="p-3.5 rounded-xl bg-[#060b14] border border-slate-800/80 space-y-1.5 font-mono text-xs">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />
              Budget Allocation Check:
            </span>
            <span className={isUnderBudget ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {formatCents(netTotalCents)} / {formatCents(budgetCap)} ({budgetUtilization}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isUnderBudget ? 'bg-cyan-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, budgetUtilization)}%` }}
            />
          </div>
        </div>
      )}

      {/* Merchant Partitioned Items */}
      <div className="space-y-4">
        {Object.entries(groupedByMerchant).map(([merchant, merchantItems]) => {
          const merchantSubtotal = merchantItems.reduce((s, it) => s + it.priceCents * it.quantity, 0);
          const hasShippingWaiver = merchantItems.some((it) => it.shippingWaived);
          const merchantDeliveryWindow = merchantItems.find((it) => it.deliveryWindow)?.deliveryWindow || '2-3 Business Days';

          return (
            <div key={merchant} className="rounded-xl border border-slate-800/80 bg-[#060b14] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono font-semibold text-white">{merchant}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {merchantDeliveryWindow}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasShippingWaiver && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      Free Shipping Waived
                    </span>
                  )}
                  <span className="font-mono text-cyan-400 font-bold">{formatCents(merchantSubtotal)}</span>
                </div>
              </div>

              <div className="space-y-2">
                {merchantItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs text-slate-300">
                    <div className="space-y-0.5">
                      <span className="font-medium text-white">{item.name}</span>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 flex-wrap">
                        <span>Qty: {item.quantity}</span>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          Rebate: {formatCents(item.rebateCents)}
                        </span>
                        {item.deliveryWindow && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-400/80">{item.deliveryWindow}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-slate-200">{formatCents(item.priceCents * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div className="space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Gross Subtotal:</span>
            <span className="text-white">{formatCents(subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-emerald-400">
            <span>Affiliate Rebate Applied (α = 0.75):</span>
            <span>-{formatCents(appliedRebateCents)}</span>
          </div>
          {budgetCap > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Buyer Budget Cap:</span>
              <span className="text-slate-200">{formatCents(budgetCap)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-slate-800 text-white">
            <span>Net Authorized Total:</span>
            <span className="text-cyan-400">{formatCents(netTotalCents)}</span>
          </div>
        </div>

        <button
          onClick={onCheckout}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs tracking-wider transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          <span>{loading ? 'Executing Multi-Unit Vault Hold...' : 'Execute Knapsack Checkout with PayPal Vault'}</span>
        </button>
      </div>
    </div>
  );
}
