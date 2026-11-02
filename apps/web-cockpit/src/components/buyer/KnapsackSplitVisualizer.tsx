'use client';

import React from 'react';
import { ShoppingBag, Truck, CheckCircle, Percent, ArrowRight, Store, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface KnapsackItem {
  product_id: string;
  title: string;
  quantity: number;
  unit_price_cents: number;
  unit_compare_price_cents: number;
  commission_rate: number;
  cleaned_url: string;
}

export interface KnapsackMerchantGroup {
  merchant_domain: string;
  delivery_window?: string;
  estimated_arrival?: string;
  subtotal_cents: number;
  commission_rebate_cents: number;
  shipping_fee_cents: number;
  shipping_waived: boolean;
  waiver_threshold_cents: number;
  net_merchant_cents: number;
  items: KnapsackItem[];
}

export interface KnapsackOptimizationData {
  assigned_merchants: KnapsackMerchantGroup[];
  gross_subtotal_cents: number;
  total_commission_rebate_cents: number;
  total_shipping_cents: number;
  total_shipping_saved_cents: number;
  net_buyer_expenditure_cents: number;
  savings_percentage: number;
  is_within_budget: boolean;
  budget_cap_cents: number;
  overage_percentage?: number;
}

interface KnapsackSplitVisualizerProps {
  optimization?: KnapsackOptimizationData;
  onProceedToAuthorize?: () => void;
  onTriggerSyntheticBid?: () => void;
}

export function KnapsackSplitVisualizer({
  optimization,
  onProceedToAuthorize,
  onTriggerSyntheticBid,
}: KnapsackSplitVisualizerProps) {
  const defaultData: KnapsackOptimizationData = {
    assigned_merchants: [
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

  const data = optimization || defaultData;

  // Group by delivery window or merchant
  const enrichedMerchants = data.assigned_merchants.map((merchant, idx) => ({
    ...merchant,
    delivery_window: merchant.delivery_window || (idx === 0 ? '2-Day Express Consolidated' : '3-4 Day Priority Freight'),
    estimated_arrival: merchant.estimated_arrival || (idx === 0 ? 'Est. Delivery in 2 business days' : 'Est. Delivery in 3-4 business days'),
  }));

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1e293b] gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-500/30 rounded-xl text-blue-700 dark:text-blue-400 shadow-xs">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              Commission-Subsidized Knapsack Cart
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30">
                Unified Delivery Windows
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Multi-merchant optimization with line-item commission rebates & coordinated shipping windows
            </p>
          </div>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-mono">Net Optimized Spend</span>
            <span className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
              {formatCents(data.net_buyer_expenditure_cents)}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
            <Percent className="w-3.5 h-3.5" />
            Save {data.savings_percentage}%
          </div>
        </div>
      </div>

      {/* Multi-Merchant Split Cards Grouped by Unified Delivery Window */}
      <div className="mt-6 space-y-5">
        {enrichedMerchants.map((merchant, idx) => {
          const threshold = merchant.waiver_threshold_cents || 25000;
          const progressPct = Math.min(100, Math.round((merchant.subtotal_cents / threshold) * 100));

          return (
            <div
              key={merchant.merchant_domain}
              className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 transition-all hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
            >
              {/* Unified Delivery Window Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-300 text-xs font-semibold">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{merchant.delivery_window}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-500" />
                    {merchant.estimated_arrival}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <Store className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {merchant.merchant_domain}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    Unit #{idx + 1}
                  </span>
                </div>
              </div>

              {/* Items in Merchant Group with Line-Item Commission Rebates */}
              <div className="divide-y divide-slate-200 dark:divide-slate-800/60 my-2">
                {merchant.items.map((item) => {
                  const lineTotalCents = item.unit_price_cents * item.quantity;
                  const itemRebateCents = Math.round(lineTotalCents * item.commission_rate * 0.75); // 75% passback
                  const netItemCents = lineTotalCents - itemRebateCents;

                  return (
                    <div key={item.product_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0">
                          {item.cleaned_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.cleaned_url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : null}
                        </div>
                        <div>
                          <div className="text-slate-900 dark:text-slate-200 font-medium truncate max-w-sm">{item.title}</div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                            <span>SKU: {item.product_id}</span>
                            <span>•</span>
                            <span>Qty: {item.quantity}</span>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30">
                              Instant Rebate: -{formatCents(itemRebateCents)} ({(item.commission_rate * 100).toFixed(0)}% rate)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-left sm:text-right font-mono flex sm:flex-col items-center sm:items-end justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-900 dark:text-slate-200 font-bold text-sm">
                            {formatCents(netItemCents)}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 line-through">
                            {formatCents(lineTotalCents)}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Save {formatCents(itemRebateCents)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tiered Shipping Threshold Progress Bar */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Truck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>Free Shipping Threshold ({formatCents(threshold)})</span>
                  </div>
                  {merchant.shipping_waived ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 text-[10px]">
                      <CheckCircle className="w-3 h-3" />
                      $15.00 Shipping Fee Waived
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 text-[10px]">
                      Add {formatCents(threshold - merchant.subtotal_cents)} to waive shipping
                    </span>
                  )}
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      merchant.shipping_waived
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Net Summary Breakdown Footer */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-6 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Gross Retail</span>
            <span className="text-slate-900 dark:text-slate-300 font-semibold">{formatCents(data.gross_subtotal_cents)}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Commission Rebates</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{formatCents(data.total_commission_rebate_cents)}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Shipping Saved</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatCents(data.total_shipping_saved_cents)}</span>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {data.is_within_budget ? (
            <button
              onClick={onProceedToAuthorize}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-500/20 active:scale-95"
            >
              Stage Multi-Unit Authorize Order
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onTriggerSyntheticBid}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-xs tracking-wider uppercase transition-all shadow-md shadow-amber-500/20 active:scale-95"
            >
              <AlertTriangle className="w-4 h-4" />
              Budget Overage ({data.overage_percentage}%) • Mint Synthetic Bid
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
