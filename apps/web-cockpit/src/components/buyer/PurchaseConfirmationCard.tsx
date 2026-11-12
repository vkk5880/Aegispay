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
  ExternalLink,
  LogIn,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ShoppingBag,
  AlertCircle,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { saveClientOrder } from '@/lib/orderStorageHelper';
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
  onCancel?: () => void;
}

export function PurchaseConfirmationCard({
  cart,
  vaultPaymentTokenId,
  zipCode = '94016',
  onConfirmPurchase,
  onViewFullCart,
  onCancel,
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

  const [status, setStatus] = useState<'IDLE' | 'AUTHORIZING' | 'SUCCESS' | 'CANCELLED' | 'ERROR'>('IDLE');
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [lastActionMsg, setLastActionMsg] = useState<string | null>(null);
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

  // Flatten items across all merchants for quick, compact display
  const allItems = merchants.flatMap((m) =>
    (m.items || []).map((it) => ({
      ...it,
      merchant_domain: m.merchant_domain,
    }))
  );

  const handleCancel = () => {
    setStatus('CANCELLED');
    setLastActionMsg('Purchase cancelled by user');
    if (onCancel) {
      onCancel();
    }
  };

  const handleLoginClick = async () => {
    try {
      setLastActionMsg('Logging in with PayPal...');
      await loginWithPayPal();
      setLastActionMsg('Logged in with PayPal');
    } catch {
      setStatus('ERROR');
    }
  };

  const handleAuthorizeClick = async () => {
    try {
      setLastActionMsg('Authorizing payment allowance...');
      await authorizePayment(netTotalCents);
      setLastActionMsg('Payment allowance authorized');
    } catch {
      setStatus('ERROR');
    }
  };

  const handleConfirmPurchase = async () => {
    setSecurityPolicyError(null);
    if (!isLoggedIn) {
      await handleLoginClick();
      return;
    }
    if (!isAuthorized) {
      await handleAuthorizeClick();
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
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const generatedOrderId = `PP-ORD-VLT-${Date.now().toString().slice(-6)}`;
      setConfirmedOrderId(generatedOrderId);
      setStatus('SUCCESS');
      setLastActionMsg(`Order ${generatedOrderId} confirmed!`);
      recordPurchaseSpend(netTotalCents);
      saveClientOrder({
        order_id: generatedOrderId,
        user_id: user?.email || 'demo',
        title: merchants[0]?.items[0]?.title
          ? (merchants[0].items.length > 1
              ? `${merchants[0].items[0].title} (+${merchants[0].items.length - 1} items)`
              : merchants[0].items[0].title)
          : 'Cart Purchase',
        price_cents: netTotalCents,
        merchant_domain: merchants[0]?.merchant_domain || 'bestbuy.com',
        cleaned_url: merchants[0]?.items[0]?.image_url,
        escrow_status: 'HELD',
        fulfillment_status: 'processing',
      });

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

  // Completely removed/dismissed view
  if (isDismissed) {
    return (
      <div className="w-full py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>Prompt removed</span>
        <button
          type="button"
          onClick={() => {
            setIsDismissed(false);
            setStatus('IDLE');
          }}
          className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline cursor-pointer"
        >
          Restore
        </button>
      </div>
    );
  }

  // Minimized Cancelled State
  if (status === 'CANCELLED') {
    return (
      <div className="w-full p-2.5 sm:p-3 rounded-xl bg-slate-100 dark:bg-[#070e1c] border border-slate-300 dark:border-slate-800 text-xs flex items-center justify-between gap-2 shadow-2xs transition-all">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 text-xs font-bold shrink-0">
            ✕
          </div>
          <div className="truncate">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Purchase cancelled
            </span>
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400 text-[11px] ml-1.5">
              • Checkout prompt was dismissed ({formatCents(netTotalCents)})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setStatus('IDLE')}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 cursor-pointer shadow-2xs transition-colors"
          >
            Reopen
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            title="Remove prompt"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Minimized Confirmed Success State
  if (status === 'SUCCESS') {
    return (
      <div className="w-full p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs transition-all">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="truncate">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Order Confirmed</span>
              <code className="text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[11px]">
                {confirmedOrderId}
              </code>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {formatCents(netTotalCents)} authorized via vaulted PayPal • 72h Price Drop Escrow active
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/history?order_id=${encodeURIComponent(confirmedOrderId || '')}`}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Track Order</span>
          </a>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Manually Minimized 1-Line Pill
  if (isMinimized) {
    return (
      <div className="w-full p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs flex items-center justify-between gap-2 shadow-2xs transition-all">
        <div className="flex items-center gap-2 truncate">
          <ShoppingBag className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-white">
            Pre-Purchase Hold • {formatCents(netTotalCents)}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono hidden sm:inline">
            ({allItems.length} {allItems.length === 1 ? 'item' : 'items'})
          </span>
          {isLoggedIn ? (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold hidden md:inline">
              • Logged in as {user?.name?.split(' ')[0] || 'User'}
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold hidden md:inline">
              • Login required
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 cursor-pointer shadow-2xs"
          >
            Expand
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-red-500 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Active User-View Ready Compact Prompt Card
  return (
    <div className="w-full bg-gradient-to-b from-white to-slate-50 dark:from-[#0a1222] dark:to-[#060b14] border border-cyan-500/40 rounded-xl p-3 sm:p-4 shadow-md relative overflow-hidden transition-all text-xs">
      {/* Top radiant light */}
      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Pre-Purchase Authorization
              </h4>
              {isVaultReady ? (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold">
                  Vault Ready
                </span>
              ) : (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold">
                  {!isLoggedIn ? 'Login Required' : 'Authorize Required'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              2PC stock reserved • 72h Price Drop Escrow
            </p>
          </div>
        </div>

        {/* Right Tools: Total, Minimize, Cancel */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right mr-1">
            <span className="text-sm font-black font-mono text-cyan-600 dark:text-cyan-400">
              {formatCents(netTotalCents)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
            title="Minimize prompt"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 rounded-md text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
            title="Cancel and dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Security Mandate Policy Block Error */}
      {securityPolicyError && (
        <div className="mt-2.5 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2 animate-fade-in font-medium">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
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

      {/* Logged in User Status Banner */}
      {isLoggedIn && (
        <div className="mt-2 py-1 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="truncate">
              Logged in as <strong>{user?.name || user?.email || 'PayPal User'}</strong>
            </span>
          </div>
          {isAuthorized && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
              Cap: {formatCents(user?.budgetCapCents || (user as any)?.budgetAllowanceCents || netTotalCents)}
            </span>
          )}
        </div>
      )}

      {/* Compact Items Preview with Small Thumbnail Images */}
      <div className="mt-2.5 space-y-1.5">
        {allItems.slice(0, 3).map((item, idx) => (
          <div
            key={item.product_id || idx}
            className="p-1.5 rounded-lg bg-white dark:bg-[#070e1a] border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              {/* Small Item Thumbnail */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.cleaned_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=128&q=80'}
                  alt={item.title}
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">
                  {item.title}
                </div>
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                  <span>Qty: {item.quantity || 1}</span>
                  <span>•</span>
                  <span className="text-cyan-600 dark:text-cyan-400">{item.merchant_domain}</span>
                </div>
              </div>
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-white text-xs shrink-0">
              {formatCents((item.unit_price_cents || item.price_cents || 0) * (item.quantity || 1))}
            </div>
          </div>
        ))}
        {allItems.length > 3 && (
          <div className="text-[10px] text-slate-500 font-mono text-center">
            +{allItems.length - 3} more item(s) in knapsack cart
          </div>
        )}
      </div>

      {/* Financial Summary & Collapsible Toggle */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
        >
          {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{showBreakdown ? 'Hide details' : 'View breakdown & delivery'}</span>
        </button>

        <div className="flex items-center gap-2">
          {platformSubsidyCents > 0 && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
              Rebate: -{formatCents(platformSubsidyCents)}
            </span>
          )}
          <span className="font-mono text-slate-900 dark:text-white font-bold">
            Net: {formatCents(netTotalCents)}
          </span>
        </div>
      </div>

      {/* Collapsible Full Breakdown */}
      {showBreakdown && (
        <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px] font-mono animate-fade-in">
          <div className="flex justify-between text-slate-500">
            <span>Gross Retail:</span>
            <span>{formatCents(grossSubtotalCents)}</span>
          </div>
          {platformSubsidyCents > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Platform Rebate:</span>
              <span>-{formatCents(platformSubsidyCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>Estimated Tax (8.25%):</span>
            <span>{formatCents(estimatedTaxCents)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Shipping:</span>
            <span>{shippingFeeCents === 0 ? 'Free ($0.00)' : formatCents(shippingFeeCents)}</span>
          </div>
          {explanation && (
            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 font-sans italic">
              &ldquo;{explanation}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Primary Action Buttons: Primary Action + Cancel Button */}
      <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
        {/* Primary Action */}
        <button
          type="button"
          onClick={handleConfirmPurchase}
          disabled={status === 'AUTHORIZING'}
          className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
        >
          {status === 'AUTHORIZING' ? (
            <>
              <CreditCard className="w-3.5 h-3.5 animate-spin" />
              <span>Authorizing via PayPal...</span>
            </>
          ) : !isLoggedIn ? (
            <>
              <LogIn className="w-3.5 h-3.5" />
              <span>Login with PayPal • {formatCents(netTotalCents)}</span>
            </>
          ) : !isVaultReady ? (
            <>
              <CreditCard className="w-3.5 h-3.5" />
              <span>Authorize Payment • {formatCents(netTotalCents)}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm Purchase • {formatCents(netTotalCents)}</span>
            </>
          )}
        </button>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={status === 'AUTHORIZING'}
          className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1 shrink-0"
        >
          <X className="w-3 h-3 text-slate-400" />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}

export default PurchaseConfirmationCard;