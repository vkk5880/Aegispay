'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Sparkles,
  Truck,
  Percent,
  Calendar,
  AlertCircle,
  ExternalLink,
  Store,
  Layers,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import type { KnapsackOptimizationData } from './KnapsackSplitVisualizer';
import { generateBundlingExplanation } from './UnifiedCartDrawer';

export interface PurchaseConfirmationCardProps {
  cart: KnapsackOptimizationData;
  vaultPaymentTokenId?: string;
  zipCode?: string;
  onConfirmPurchase?: (result: {
    orderId: string;
    authorizedCents: number;
    cart: KnapsackOptimizationData;
  }) => void;
  onViewFullCart?: () => void;
}

export function PurchaseConfirmationCard({
  cart,
  vaultPaymentTokenId = 'vlt_token_paypal_live_9a7d2',
  zipCode = '94016',
  onConfirmPurchase,
  onViewFullCart,
}: PurchaseConfirmationCardProps) {
  const [status, setStatus] = useState<'IDLE' | 'AUTHORIZING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);

  const merchants = cart.assigned_merchants || [];
  const explanation = generateBundlingExplanation(cart);

  // Financial calculations
  const grossSubtotalCents = cart.gross_subtotal_cents;
  const platformSubsidyCents = cart.total_commission_rebate_cents;
  const estimatedTaxCents = Math.round(grossSubtotalCents * 0.0825);
  const shippingFeeCents = cart.total_shipping_cents;
  const netTotalCents = grossSubtotalCents - platformSubsidyCents + shippingFeeCents + estimatedTaxCents;

  const handleConfirmPurchase = async () => {
    setStatus('AUTHORIZING');
    try {
      // Simulate/trigger fast 1-click authorization via vaulted PayPal token
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const generatedOrderId = `PP-ORD-VLT-${Date.now().toString().slice(-6)}`;
      setConfirmedOrderId(generatedOrderId);
      setStatus('SUCCESS');

      if (onConfirmPurchase) {
        onConfirmPurchase({
          orderId: generatedOrderId,
          authorizedCents: netTotalCents,
          cart,
        });
      }
    } catch {
      setStatus('ERROR');
    }
  };

  return (
    <div className="w-full bg-gradient-to-b from-white to-slate-50 dark:from-[#0a1222] dark:to-[#060b14] border border-cyan-500/40 rounded-2xl p-5 shadow-lg relative overflow-hidden transition-all">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800 gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Pre-Purchase Confirmation Order
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold">
                Vault v3 Token Ready
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Multi-merchant knapsack allocation pre-cleared with 2PC inventory holds
            </p>
          </div>
        </div>

        {onViewFullCart && (
          <button
            type="button"
            onClick={onViewFullCart}
            className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-semibold self-start sm:self-center"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inspect Multi-Vendor Drawer</span>
          </button>
        )}
      </div>

      {/* Explainable Bundling Rationale Box */}
      <div className="mt-4 p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 space-y-1">
        <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
          <span>Multi-Merchant Bundling Explanation</span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans font-medium">
          &ldquo;{explanation}&rdquo;
        </p>
      </div>

      {/* Shipment & Merchant Groups Preview */}
      <div className="mt-4 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Delivery Windows ({merchants.length} Merchant Split)
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {merchants.map((m) => (
            <div
              key={m.merchant_domain}
              className="p-3 rounded-xl bg-white dark:bg-[#070e1c] border border-slate-200 dark:border-slate-800 text-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800/60 font-mono">
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {m.merchant_domain}
                </span>
                <span className="text-[10px] text-slate-500">{m.items.length} items</span>
              </div>

              <div className="pt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                  <Calendar className="w-3 h-3 text-cyan-500 shrink-0" />
                  <span className="truncate">{m.delivery_window || '2-3 Business Days'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Shipping:</span>
                  {m.shipping_waived ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      $0.00 (Waived)
                    </span>
                  ) : (
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {formatCents(m.shipping_fee_cents)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Summary Breakdown Table */}
      <div className="mt-4 p-3.5 rounded-xl bg-white dark:bg-[#070e1c] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-400">Retail Subtotal</span>
          <span className="font-mono text-slate-900 dark:text-white font-medium">
            {formatCents(grossSubtotalCents)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <Percent className="w-3 h-3" />
            Platform Subsidy (Rebates Passed to You)
          </span>
          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
            -{formatCents(platformSubsidyCents)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-400">
            Estimated Tax (ZIP: {zipCode})
          </span>
          <span className="font-mono text-slate-900 dark:text-white">
            {formatCents(estimatedTaxCents)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-slate-400">Shipping</span>
          <span className="font-mono text-slate-900 dark:text-white">
            {shippingFeeCents === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                $0.00 Waived
              </span>
            ) : (
              formatCents(shippingFeeCents)
            )}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline">
          <div>
            <span className="font-bold text-slate-900 dark:text-white text-sm">Net Total</span>
            <span className="block text-[10px] text-slate-500 font-sans">
              Decoupled: Authorized to merchants at full retail
            </span>
          </div>
          <span className="text-lg font-black font-mono text-cyan-600 dark:text-cyan-400">
            {formatCents(netTotalCents)}
          </span>
        </div>
      </div>

      {/* Action / Success State */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
        {status === 'SUCCESS' ? (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 space-y-1.5 animate-fade-in">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span>Purchase Pre-Authorized via Vaulted PayPal!</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              PayPal Multi-Purchase Unit Order: <code className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{confirmedOrderId}</code>
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
              <span>Transferred to 72h Render Price-Drop Watcher</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleConfirmPurchase}
              disabled={status === 'AUTHORIZING'}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              {status === 'AUTHORIZING' ? (
                <span>Authorizing with Vaulted PayPal...</span>
              ) : (
                <span>Confirm Purchase with Vaulted PayPal • {formatCents(netTotalCents)}</span>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Pre-authorized token: {vaultPaymentTokenId} • Zero Upfront Risk</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
