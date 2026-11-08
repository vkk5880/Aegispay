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
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface MultiMerchantCartItem {
  id: string;
  name: string;
  merchantDomain: string;
  priceCents: number;
  quantity: number;
  rebateCents: number;
  shippingWaived: boolean;
  deliveryWindow?: string;
}

export interface KnapsackCartViewProps {
  items?: MultiMerchantCartItem[];
  onCheckout?: () => void;
  loading?: boolean;
}

export function KnapsackCartView({ items, onCheckout, loading }: KnapsackCartViewProps) {
  const cartItems: MultiMerchantCartItem[] = items || [
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

  // Group items safely by merchant domain (handling undefined/empty gracefully)
  const groupedByMerchant = cartItems.reduce((acc, item) => {
    const domain = (item.merchantDomain || 'unassigned-merchant.com').trim().toLowerCase();
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(item);
    return acc;
  }, {} as Record<string, MultiMerchantCartItem[]>);

  // Validate price and quantity integrity (guard against negative values or NaN)
  const subtotalCents = cartItems.reduce((sum, item) => {
    const price = Math.max(0, Number(item.priceCents) || 0);
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    return sum + price * qty;
  }, 0);

  const totalRebateCents = cartItems.reduce((sum, item) => {
    const rebate = Math.max(0, Number(item.rebateCents) || 0);
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    return sum + rebate * qty;
  }, 0);

  // Net cannot be negative
  const netTotalCents = Math.max(0, subtotalCents - totalRebateCents);

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
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
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
      </div>

      {/* Merchant Partitioned Items */}
      <div className="space-y-4">
        {Object.entries(groupedByMerchant).map(([merchant, merchantItems]) => {
          const merchantSubtotal = merchantItems.reduce((s, it) => s + it.priceCents * it.quantity, 0);
          const hasShippingWaiver = merchantItems.some((it) => it.shippingWaived);
          const merchantDeliveryWindow = merchantItems.find((it) => it.deliveryWindow)?.deliveryWindow || '2-3 Business Days';

          return (
            <div key={merchant} className="rounded-xl border border-slate-800/80 bg-[#060b14] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Store className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono font-semibold text-white">{merchant}</span>
                  <span className="text-[10px] font-mono text-slate-400">({merchantDeliveryWindow})</span>
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
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span>Qty: {item.quantity}</span>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          Rebate: {formatCents(item.rebateCents)}
                        </span>
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
            <span>Affiliate Rebate Applied:</span>
            <span>-{formatCents(totalRebateCents)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-800 text-white">
            <span>Net Authorized Total:</span>
            <span className="text-cyan-400">{formatCents(netTotalCents)}</span>
          </div>
        </div>

        <button
          onClick={onCheckout}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs tracking-wider transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
