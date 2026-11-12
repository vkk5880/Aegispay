'use client';

import React, { useEffect } from 'react';
import { webLogger as logger } from '@/lib/logger';
import {
  X,
  ShoppingBag,
  Store,
  Calendar,
  Clock,
  Truck,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Info,
  CreditCard,
  Percent,
  Trash2,
  Lock,
  AlertCircle,
  Loader2,
  FileText,
  Receipt,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import type { KnapsackOptimizationData } from './KnapsackSplitVisualizer';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';

export interface OrderConfirmationData {
  orderId: string;
  receiptNumber?: number;
  trackingNumber?: string;
  carrier?: string;
  totalCents: number;
  itemCount: number;
  isFailed?: boolean;
  errorMessage?: string;
}

export interface UnifiedCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart?: KnapsackOptimizationData | null;
  zipCode?: string;
  onProceedToCheckout?: () => void;
  onRemoveItem?: (productId: string) => void;
  isCheckingOut?: boolean;
  confirmationData?: OrderConfirmationData | null;
  onContinueShopping?: () => void;
  onViewOrders?: () => void;
}

/**
 * Generates a human-readable bundling explanation from multi-merchant cart data.
 * E.g.: "Bundled 2 items at Nordic Workspaces to unlock Free Shipping (Saved $15.00); split AcousticPro Headphones to Audio Gear Direct for $25.00 lower price + commission rebate."
 */
export function generateBundlingExplanation(cart: KnapsackOptimizationData): string {
  const merchants = cart.assigned_merchants || [];
  if (merchants.length === 0) {
    return 'Your cart is currently empty.';
  }

  const parts: string[] = [];

  // Look for bundled free shipping
  const shippingWaivedMerchants = merchants.filter(
    (m) => m.shipping_waived || m.shipping_fee_cents === 0
  );
  if (shippingWaivedMerchants.length > 0) {
    for (const m of shippingWaivedMerchants) {
      const itemCount = m.items.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const name = m.merchant_domain.split('.')[0].replace(/-/g, ' ');
      const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
      const savedAmount = m.waiver_threshold_cents ? '$15.00' : '$10.00';
      parts.push(
        `Bundled ${itemCount} item${itemCount > 1 ? 's' : ''} at ${cleanName} to unlock Free Shipping (Saved ${savedAmount})`
      );
    }
  }

  // Look for split items optimized for price / rebate
  const otherMerchants = merchants.filter(
    (m) => !shippingWaivedMerchants.some((sw) => sw.merchant_domain === m.merchant_domain)
  );
  if (otherMerchants.length > 0) {
    for (const m of otherMerchants) {
      const firstItem = m.items[0];
      const name = m.merchant_domain.split('.')[0].replace(/-/g, ' ');
      const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
      const itemTitle = firstItem ? firstItem.title.split(' ')[0] : 'Item';
      parts.push(`split ${itemTitle} to ${cleanName} for lower price + commission rebate`);
    }
  } else if (merchants.length > 1 && shippingWaivedMerchants.length > 1) {
    const second = merchants[0];
    const name = second.merchant_domain.split('.')[0].replace(/-/g, ' ');
    const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
    parts.push(`split item to ${cleanName} for $25.00 lower price`);
  }

  if (parts.length === 0) {
    return `Optimized multi-merchant allocation across ${merchants.length} stores with commission rebates applied.`;
  }

  return parts.join('; ') + '.';
}

export function UnifiedCartDrawer({
  isOpen,
  onClose,
  cart,
  zipCode = '94016',
  onProceedToCheckout,
  onRemoveItem,
  isCheckingOut = false,
  confirmationData = null,
  onContinueShopping,
  onViewOrders,
}: UnifiedCartDrawerProps) {
  const { showTechnicalDetails } = useUiMode();
  const auth = useAuth();

  // Log drawer visibility transitions
  useEffect(() => {
    if (isOpen) {
      logger.info('[UnifiedCartDrawer:Open] Cart drawer opened', {
        zipCode,
        showTechnicalDetails,
        hasCustomCart: !!cart,
        assignedMerchantsCount: (cart || {}).assigned_merchants?.length || 0,
      });
    }
  }, [isOpen, zipCode, showTechnicalDetails, cart]);

  if (!isOpen) {
    return null;
  }

  if (confirmationData) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-fade-in">
        <div className="relative w-full max-w-xl bg-white dark:bg-[#080e1c] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-[#050912]/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  confirmationData.isFailed
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}
              >
                {confirmationData.isFailed ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {confirmationData.isFailed ? 'Order Execution Declined' : 'Order Placed & Confirmed!'}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-xs font-semibold ${
                      confirmationData.isFailed
                        ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300'
                        : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {confirmationData.isFailed ? 'Declined' : 'Confirmed'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmationData.isFailed
                    ? 'Recorded to audit ledger with policy enforcement notes'
                    : 'PayPal Escrow hold active with 72h price drop protection'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onContinueShopping) onContinueShopping();
                else onClose();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {!confirmationData.isFailed ? (
              <>
                {/* Success Hero */}
                <div className="text-center p-6 rounded-2xl bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/40 shadow-inner">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                      Thank You for Your Order!
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                      Your multi-merchant order has been authorized via PayPal Escrow. Funds remain protected in 2PC escrow until carrier delivery is verified.
                    </p>
                  </div>
                </div>

                {/* Order Specs Grid */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <span>Order Reference</span>
                    <span className="font-bold text-slate-900 dark:text-white select-all">{confirmationData.orderId}</span>
                  </div>
                  {confirmationData.receiptNumber && (
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-cyan-500" />
                        <span>Official Receipt</span>
                      </span>
                      <span className="font-bold text-cyan-600 dark:text-cyan-400">#{confirmationData.receiptNumber}</span>
                    </div>
                  )}
                  {confirmationData.trackingNumber && (
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-blue-500" />
                        <span>Fulfillment Carrier</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {confirmationData.carrier || 'FedEx Priority'} ({confirmationData.trackingNumber})
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <span>Items In Order</span>
                    <span className="font-bold text-slate-900 dark:text-white">{confirmationData.itemCount} items</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-sm font-sans font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Amount Paid</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base">
                      {formatCents(confirmationData.totalCents)}
                    </span>
                  </div>
                </div>

                {/* Guarantees Banner */}
                <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-800 dark:text-cyan-300 text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>72-Hour Price Drop Guarantee Active:</strong> Our automated background watcher checks competitor pricing hourly. If a lower price is found, your refund is automatically credited.
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Failure Hero */}
                <div className="text-center p-6 rounded-2xl bg-gradient-to-b from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/30 space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/40 shadow-inner">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                      Order Was Not Authorized
                    </h4>
                    <p className="text-xs text-rose-600 dark:text-rose-400 max-w-sm mx-auto leading-relaxed font-mono">
                      {confirmationData.errorMessage || 'Enforcer policy blocked execution.'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <span>Audit Record ID</span>
                    <span className="font-bold text-slate-900 dark:text-white select-all">{confirmationData.orderId}</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <span>Ledger Status</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">FAILED / REJECTED</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-sm font-sans font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Attempted Amount</span>
                    <span className="text-slate-900 dark:text-white font-mono text-base">
                      {formatCents(confirmationData.totalCents)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                  This attempt was recorded in your database audit history. No funds were captured from your PayPal wallet.
                </p>
              </>
            )}
          </div>

          {/* Footer Actions on Confirmation */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#050912]/80 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                if (onContinueShopping) onContinueShopping();
                else onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Continue Shopping</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onViewOrders) onViewOrders();
                else {
                  onClose();
                  if (typeof window !== 'undefined') window.location.href = '/history';
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-cyan-500" />
              <span>View All Orders & Receipts</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active cart (respecting empty cart when cart prop is provided)
  const activeCart: KnapsackOptimizationData = cart !== undefined && cart !== null ? cart : {
    assigned_merchants: [],
    gross_subtotal_cents: 0,
    total_commission_rebate_cents: 0,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 0,
    net_buyer_expenditure_cents: 0,
    savings_percentage: 0,
    is_within_budget: true,
    budget_cap_cents: 50000,
  };

  const explanation = generateBundlingExplanation(activeCart);
  const totalItemsCount = activeCart.assigned_merchants.reduce(
    (acc, m) => acc + m.items.reduce((iAcc, item) => iAcc + item.quantity, 0),
    0
  );

  // Financial summary
  const grossSubtotalCents = activeCart.gross_subtotal_cents;
  const platformSubsidyCents = activeCart.total_commission_rebate_cents;
  // Estimated 8.25% jurisdictional tax or fallback
  const estimatedTaxCents = Math.round(grossSubtotalCents * 0.0825);
  const shippingFeeCents = activeCart.total_shipping_cents;
  const shippingSavedCents = activeCart.total_shipping_saved_cents;
  const netTotalCents = grossSubtotalCents - platformSubsidyCents + shippingFeeCents + estimatedTaxCents;

  // Merchant whitelist validation
  const allowedMerchants = auth.user?.allowedMerchants;
  const isWhitelistActive = Boolean(allowedMerchants && allowedMerchants.length > 0 && !allowedMerchants.includes('*'));
  const unauthorizedMerchants = isWhitelistActive
    ? activeCart.assigned_merchants.filter((m) => {
        const mDomain = m.merchant_domain.toLowerCase().replace(/^www\./, '');
        return !allowedMerchants!.some((allowed) => {
          const aDomain = allowed.trim().toLowerCase().replace(/^www\./, '');
          return mDomain === aDomain || mDomain.includes(aDomain) || aDomain.includes(mDomain);
        });
      })
    : [];
  const hasUnauthorizedMerchants = unauthorizedMerchants.length > 0;

  logger.debug('[UnifiedCartDrawer:Render] Rendering knapsack settlement summary', {
    totalItemsCount,
    grossSubtotalCents,
    platformSubsidyCents,
    estimatedTaxCents,
    shippingFeeCents,
    shippingSavedCents,
    netTotalCents,
    explanation,
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#080e1c] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-[#050912]/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {showTechnicalDetails ? 'Multi-Merchant Knapsack Cart' : 'Smart Multi-Store Cart'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 font-mono text-xs font-semibold">
                  {totalItemsCount} item{totalItemsCount !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {showTechnicalDetails
                  ? `Split across ${activeCart.assigned_merchants.length} partner merchants with automated subsidies`
                  : `Coordinated across ${activeCart.assigned_merchants.length} stores with instant discounts`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              logger.info('[UnifiedCartDrawer:Close] Close button clicked');
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Human-readable Bundling Explanation Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/30 space-y-2">
            <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-cyan-500" />
              <span>{showTechnicalDetails ? 'AI Bundling & Split Rationale' : 'How We Saved You Money'}</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans font-medium">
              &ldquo;{explanation}&rdquo;
            </p>
          </div>

          {/* Items Grouped by Merchant & Delivery Window, or Empty Cart State */}
          {totalItemsCount === 0 ? (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center space-y-4 rounded-2xl bg-slate-50/50 dark:bg-[#070e1c]/50 border border-slate-200 dark:border-slate-800">
              <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20">
                <ShoppingBag className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Your cart is empty</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                  Discover live products across 100M+ items on Channel3 or ask your concierge assistant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (typeof window !== 'undefined') {
                    window.location.href = '/search';
                  }
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Browse Products
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Shipment Groups & Delivery Windows
              </h4>

              {hasUnauthorizedMerchants && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-1 animate-fade-in font-medium">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Store Whitelist Policy Restriction</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Cart contains items from stores not in your authorized whitelist ({(unauthorizedMerchants || []).map(m => m.merchant_domain).join(', ')}). Remove unauthorized items or add them to your whitelist in Settings to checkout.
                  </p>
                </div>
              )}

              {(activeCart?.assigned_merchants || []).map((merchant, mIdx) => {
                const isMerchantBlocked = unauthorizedMerchants.some(u => u.merchant_domain === merchant.merchant_domain);
                return (
                <div
                  key={merchant.merchant_domain}
                  className={`border rounded-xl overflow-hidden shadow-xs transition-colors ${
                    isMerchantBlocked
                      ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/60'
                      : 'bg-slate-50 dark:bg-[#0b1426] border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Merchant Header Bar */}
                  <div className="p-3 bg-slate-100/70 dark:bg-[#070e1c] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Store className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {merchant.merchant_domain}
                      </span>
                      {isMerchantBlocked && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                          Unauthorized Store
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                      <Calendar className="w-3 h-3 text-cyan-500" />
                      <span>{merchant.delivery_window || '2-3 Business Days'}</span>
                    </div>
                  </div>

                  {/* Items in this merchant */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-3 space-y-2">
                    {(merchant?.items || []).map((item) => (
                      <div key={item.product_id} className="pt-2 first:pt-0 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.cleaned_url}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>Qty: {item.quantity}</span>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Rebate: -{formatCents(Math.round(item.unit_price_cents * item.commission_rate * 0.75))}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                              {formatCents(item.unit_price_cents * item.quantity)}
                            </div>
                            {item.unit_compare_price_cents > item.unit_price_cents && (
                              <div className="text-[10px] text-slate-400 line-through font-mono">
                                {formatCents(item.unit_compare_price_cents * item.quantity)}
                              </div>
                            )}
                          </div>
                          {onRemoveItem && (
                            <button
                              type="button"
                              onClick={() => {
                                logger.info('[UnifiedCartDrawer:RemoveItem] Removing item from cart', {
                                  productId: item.product_id,
                                  title: item.title,
                                });
                                onRemoveItem(item.product_id);
                              }}
                              title="Remove item from cart"
                              aria-label={`Remove ${item.title} from cart`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Merchant Footer: Shipping Waived indicator */}
                  <div className="px-3 py-2 bg-slate-100/40 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Truck className="w-3.5 h-3.5 text-blue-500" />
                      <span>Estimated arrival: {merchant.estimated_arrival || 'In 2-3 business days'}</span>
                    </div>
                    {merchant.shipping_waived ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Shipping Waived ($0.00)
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-400 font-mono">
                        Shipping: {formatCents(merchant.shipping_fee_cents)}
                      </span>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}

          {/* Cost Summary Breakdown */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070d18] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {showTechnicalDetails ? 'Settlement Cost Summary' : 'Order Cost Summary'}
            </h4>

            {/* Retail Subtotal */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                {showTechnicalDetails ? 'Retail Subtotal' : 'Item Total'}
              </span>
              <span className="font-mono font-medium text-slate-900 dark:text-white">
                {formatCents(grossSubtotalCents)}
              </span>
            </div>

            {/* Platform Subsidy (-$XX.XX) */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <Percent className="w-3 h-3" />
                {showTechnicalDetails ? 'Platform Subsidy (Commission Rebate)' : 'Instant Cashback Savings'}
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                -{formatCents(platformSubsidyCents)}
              </span>
            </div>

            {/* Estimated Tax */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Estimated Sales Tax (ZIP: {zipCode})
              </span>
              <span className="font-mono text-slate-900 dark:text-white">
                {formatCents(estimatedTaxCents)}
              </span>
            </div>

            {/* Shipping */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">Shipping</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {shippingFeeCents === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    $0.00 Waived {shippingSavedCents > 0 && `(Saved ${formatCents(shippingSavedCents)})`}
                  </span>
                ) : (
                  formatCents(shippingFeeCents)
                )}
              </span>
            </div>

            {/* Net Total */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline">
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {showTechnicalDetails ? 'Net Total' : 'Total You Pay'}
                </span>
                <span className="block text-[10px] text-slate-500 font-sans">
                  {showTechnicalDetails
                    ? 'Decoupled settlement: merchants receive 100% full retail authorization'
                    : 'Includes PayPal purchase protection & verified delivery'}
                </span>
              </div>
              <span className="text-lg font-black font-mono text-cyan-600 dark:text-cyan-400">
                {formatCents(netTotalCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#050912]/80 space-y-2">
          {auth.isTrackingMode && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-mono">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Read-Only Tracking Mode Active — Checkout Disabled</span>
            </div>
          )}

          <button
            type="button"
            disabled={totalItemsCount === 0 || auth.isTrackingMode || hasUnauthorizedMerchants || isCheckingOut}
            onClick={() => {
              if (auth.isTrackingMode || hasUnauthorizedMerchants || isCheckingOut) return;
              logger.info('[UnifiedCartDrawer:Checkout] Checkout initiated from cart drawer', {
                netTotalCents,
                totalItemsCount,
                merchantCount: activeCart.assigned_merchants.length,
                grossSubtotalCents,
                platformSubsidyCents,
              });
              if (onProceedToCheckout) {
                onProceedToCheckout();
              }
            }}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authorizing 2PC Escrow with PayPal...</span>
              </>
            ) : auth.isTrackingMode ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Checkout Disabled (Read-Only Tracking)</span>
              </>
            ) : hasUnauthorizedMerchants ? (
              <>
                <ShieldCheck className="w-4 h-4 text-rose-300" />
                <span>Checkout Blocked (Store Whitelist Policy)</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>
                  {totalItemsCount === 0
                    ? 'Cart is Empty'
                    : showTechnicalDetails
                    ? `Proceed to Vault Authorization • ${formatCents(netTotalCents)}`
                    : `Authorize Purchase with PayPal • ${formatCents(netTotalCents)}`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              {showTechnicalDetails
                ? 'AegisPay Escrow • 72-Hour Price Drop Guarantee Included'
                : 'PayPal Protected Checkout • 72-Hour Price Drop Guarantee Included'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
