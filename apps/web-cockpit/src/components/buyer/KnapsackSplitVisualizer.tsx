'use client';

import React from 'react';
import { ShoppingBag, Truck, CheckCircle, Percent, ArrowRight, Store, AlertTriangle } from 'lucide-react';
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
                ILP Solver
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Multi-merchant optimization with 75% Channel3 rebate passback & shipping waiver thresholds
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

      {/* Multi-Merchant Split Cards */}
      <div className="mt-6 space-y-4">
        {data.assigned_merchants.map((merchant, idx) => {
          const threshold = merchant.waiver_threshold_cents || 25000;
          const progressPct = Math.min(100, Math.round((merchant.subtotal_cents / threshold) * 100));

          return (
            <div
              key={merchant.merchant_domain}
              className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 transition-all hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-200">
                    {merchant.merchant_domain}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400">
                    Purchase Unit #{idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-slate-600 dark:text-slate-400">
                    Subtotal: <strong className="text-slate-900 dark:text-slate-200">{formatCents(merchant.subtotal_cents)}</strong>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    Rebate: -{formatCents(merchant.commission_rebate_cents)}
                  </span>
                </div>
              </div>

              {/* Items in Merchant Group */}
              <div className="divide-y divide-slate-200 dark:divide-slate-800/60 my-2">
                {merchant.items.map((item) => (
                  <div key={item.product_id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                        {item.cleaned_url ? (
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
                        <div className="text-slate-900 dark:text-slate-200 font-medium truncate max-w-xs">{item.title}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Channel3 SKU: {item.product_id} • Rate: {(item.commission_rate * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-slate-900 dark:text-slate-200 font-semibold">{formatCents(item.unit_price_cents * item.quantity)}</div>
                      {item.unit_compare_price_cents > item.unit_price_cents && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 line-through">
                          {formatCents(item.unit_compare_price_cents * item.quantity)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
            <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Commission Rebate (α=0.75)</span>
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
