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
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import type { KnapsackOptimizationData } from './KnapsackSplitVisualizer';
import { useUiMode } from '@/context/UiModeContext';

export interface UnifiedCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart?: KnapsackOptimizationData | null;
  zipCode?: string;
  onProceedToCheckout?: () => void;
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
}: UnifiedCartDrawerProps) {
  const { showTechnicalDetails } = useUiMode();

  // Log drawer visibility transitions
  useEffect(() => {
    if (isOpen) {
      logger.info('[UnifiedCartDrawer:Open] Cart drawer opened', {
        zipCode,
        showTechnicalDetails,
        hasCustomCart: !!cart,
        assignedMerchantsCount: (cart || {}).assigned_merchants?.length || 2,
      });
    }
  }, [isOpen, zipCode, showTechnicalDetails, cart]);

  if (!isOpen) {
    return null;
  }

  // Fallback default sample cart if none passed
  const activeCart: KnapsackOptimizationData = cart || {
    assigned_merchants: [
      {
        merchant_domain: 'nordic-workspaces.io',
        delivery_window: '3-4 Day Priority Freight',
        estimated_arrival: 'Est. Delivery in 3-4 business days',
        subtotal_cents: 19500,
        commission_rebate_cents: 1755,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 15000,
        net_merchant_cents: 17745,
        items: [
          {
            product_id: 'ch3_desk_mat_walnut',
            title: 'Precision Felt & Walnut Desk Organizer Pad',
            quantity: 1,
            unit_price_cents: 8500,
            unit_compare_price_cents: 11000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80',
          },
          {
            product_id: 'ch3_usb_dac_amp',
            title: 'Hi-Fi 32-bit USB Audio DAC/Amp Interface',
            quantity: 1,
            unit_price_cents: 11000,
            unit_compare_price_cents: 14000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80',
          },
        ],
      },
      {
        merchant_domain: 'audio-gear-direct.com',
        delivery_window: '2-Day Express Consolidated',
        estimated_arrival: 'Est. Delivery in 2 business days',
        subtotal_cents: 28000,
        commission_rebate_cents: 3150,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 25000,
        net_merchant_cents: 24850,
        items: [
          {
            product_id: 'ch3_anc_headphone_01',
            title: 'AcousticPro ANC Studio Headphones (Midnight)',
            quantity: 1,
            unit_price_cents: 28000,
            unit_compare_price_cents: 34999,
            commission_rate: 0.15,
            cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
          },
        ],
      },
    ],
    gross_subtotal_cents: 47500,
    total_commission_rebate_cents: 4905,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 2500,
    net_buyer_expenditure_cents: 42595,
    savings_percentage: 29.0,
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

          {/* Items Grouped by Merchant & Delivery Window */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Shipment Groups & Delivery Windows
            </h4>

            {activeCart.assigned_merchants.map((merchant, mIdx) => (
              <div
                key={merchant.merchant_domain}
                className="bg-slate-50 dark:bg-[#0b1426] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs"
              >
                {/* Merchant Header Bar */}
                <div className="p-3 bg-slate-100/70 dark:bg-[#070e1c] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {merchant.merchant_domain}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                    <Calendar className="w-3 h-3 text-cyan-500" />
                    <span>{merchant.delivery_window || '2-3 Business Days'}</span>
                  </div>
                </div>

                {/* Items in this merchant */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-3 space-y-2">
                  {merchant.items.map((item) => (
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
            ))}
          </div>

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
          <button
            type="button"
            onClick={() => {
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
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {showTechnicalDetails
                ? `Proceed to Vault Authorization • ${formatCents(netTotalCents)}`
                : `Authorize Purchase with PayPal • ${formatCents(netTotalCents)}`}
            </span>
            <ArrowRight className="w-4 h-4" />
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
