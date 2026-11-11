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
  LogIn,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import type { KnapsackOptimizationData } from './KnapsackSplitVisualizer';
import { generateBundlingExplanation } from './UnifiedCartDrawer';
import { useAuth } from '@/context/AuthContext';
import { useUiMode } from '@/context/UiModeContext';

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
  vaultPaymentTokenId,
  zipCode = '94016',
  onConfirmPurchase,
  onViewFullCart,
}: PurchaseConfirmationCardProps) {
  const { showTechnicalDetails } = useUiMode();
  const {
    user,
    isLoggedIn,
    isAuthorized,
    loginWithPayPal,
    authorizePayment,
    recordPurchaseSpend,
  } = useAuth();

  const [status, setStatus] = useState<'IDLE' | 'AUTHORIZING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [securityPolicyError, setSecurityPolicyError] = useState<string | null>(null);

  const merchants = cart.assigned_merchants || [];
  const explanation = generateBundlingExplanation(cart);

  // Financial calculations
  const grossSubtotalCents = cart.gross_subtotal_cents;
  const platformSubsidyCents = cart.total_commission_rebate_cents;
  const estimatedTaxCents = Math.round(grossSubtotalCents * 0.0825);
  const shippingFeeCents = cart.total_shipping_cents;
  const netTotalCents = grossSubtotalCents - platformSubsidyCents + shippingFeeCents + estimatedTaxCents;

  const effectiveTokenId = vaultPaymentTokenId || user?.vaultSetupTokenId;
  const isVaultReady = isAuthorized && Boolean(effectiveTokenId);

  const handleConfirmPurchase = async () => {
    setSecurityPolicyError(null);
    if (!isLoggedIn) {
      await loginWithPayPal();
      return;
    }
    if (!isAuthorized) {
      await authorizePayment();
      return;
    }

    // 1. Verify Allowed Merchants Whitelist
    const allowedMerchants = user?.allowedMerchants;
    if (allowedMerchants && allowedMerchants.length > 0 && !allowedMerchants.includes('*')) {
      const unauthorizedMerchant = merchants.find((m) => {
        const mDomain = m.merchant_domain.toLowerCase().replace(/^www\./, '');
        return !allowedMerchants.some((allowed) => {
          const aDomain = allowed.trim().toLowerCase().replace(/^www\./, '');
          return mDomain === aDomain || mDomain.includes(aDomain) || aDomain.includes(mDomain);
        });
      });

      if (unauthorizedMerchant) {
        setSecurityPolicyError(
          `Store "${unauthorizedMerchant.merchant_domain}" is not in your authorized store whitelist (${allowedMerchants.join(', ')}). Please update your allowed merchant list in Settings or Login.`
        );
        return;
      }
    }

    // 2. Verify Allowed Categories
    const allowedCats = user?.allowedCategories;
    if (allowedCats && allowedCats.length > 0 && !allowedCats.includes('*')) {
      for (const m of merchants) {
        for (const it of m.items) {
          const itCat = (it as any).category_id;
          if (itCat) {
            const isAllowed = allowedCats.some(
              (c) => c.toLowerCase() === itCat.toLowerCase() || itCat.toLowerCase().includes(c.toLowerCase())
            );
            if (!isAllowed) {
              setSecurityPolicyError(
                `Category "${itCat}" for item "${it.title}" is not permitted under your active spend mandate. Allowed categories: ${allowedCats.join(', ')}.`
              );
              return;
            }
          }
        }
      }
    }

    setStatus('AUTHORIZING');
    try {
      // Simulate/trigger fast 1-click authorization via vaulted PayPal token
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const generatedOrderId = `PP-ORD-VLT-${Date.now().toString().slice(-6)}`;
      setConfirmedOrderId(generatedOrderId);
      setStatus('SUCCESS');
      recordPurchaseSpend(netTotalCents);

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
              {isVaultReady ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold">
                  Vault v3 Token Ready
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold">
                  {!isLoggedIn ? 'Login Required' : 'Authorization Required'}
                </span>
              )}
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

      {/* Security Mandate Policy Block Error */}
      {securityPolicyError && (
        <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{securityPolicyError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSecurityPolicyError(null)}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 cursor-pointer shrink-0 font-bold"
          >
            ✕
          </button>
        </div>
      )}

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

              <div className="py-2 space-y-1">
                {m.items.map((it) => (
                  <div key={it.product_id} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-600 dark:text-slate-300 truncate max-w-[170px]">
                      {it.quantity}x {it.title}
                    </span>
                    <span className="font-mono text-slate-900 dark:text-white font-semibold">
                      {formatCents(it.unit_price_cents * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Truck className="w-3 h-3" />
                  {m.shipping_waived ? 'Waived Shipping' : formatCents(m.shipping_fee_cents)}
                </span>
                <span>{m.delivery_window || 'Express'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Breakdown Table */}
      <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800/80 space-y-2 text-xs font-mono">
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>Gross Retail Subtotal</span>
          <span>{formatCents(grossSubtotalCents)}</span>
        </div>

        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
          <span className="flex items-center gap-1">
            <Percent className="w-3 h-3" />
            <span>Decoupled Platform Subsidy</span>
          </span>
          <span>-{formatCents(platformSubsidyCents)}</span>
        </div>

        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>Estimated Sales Tax (8.25%)</span>
          <span>{formatCents(estimatedTaxCents)}</span>
        </div>

        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>Consolidated Shipping</span>
          <span>
            {shippingFeeCents === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">$0.00 (Waived)</span>
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
              {status === 'AUTHORIZING' ? (
                <>
                  <CreditCard className="w-4 h-4 animate-spin" />
                  <span>Authorizing with Vaulted PayPal...</span>
                </>
              ) : !isLoggedIn ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Login with PayPal to Authorize • {formatCents(netTotalCents)}</span>
                </>
              ) : !isVaultReady ? (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Authorize Payment Allowance • {formatCents(netTotalCents)}</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Confirm Purchase with Vaulted PayPal • {formatCents(netTotalCents)}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {isVaultReady
                  ? `Pre-authorized token: ${effectiveTokenId || 'Active'} • Zero Upfront Risk`
                  : 'Requires PayPal Login & Vault v3 Authorization'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
