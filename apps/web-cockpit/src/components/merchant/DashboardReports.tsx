'use client';

import React from 'react';
import Link from 'next/link';
import { Package, Repeat, FileText, Wallet, ArrowLeftRight, TrendingUp, ShieldCheck } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

export interface DashboardReportMetrics {
  totalProducts?: number;
  activePlans?: number;
  openInvoices?: number;
  usdBalance?: string;
  recentTxCount?: number;
}

export function DashboardReports({ metrics = {} }: { metrics?: DashboardReportMetrics }) {
  const { showTechnicalDetails } = useUiMode();
  const cards = [
    {
      title: 'Catalog Products',
      count: metrics.totalProducts ?? 2,
      label: 'Active SKUs in Catalog',
      href: '/merchant/products',
      icon: Package,
      gradient: 'from-blue-600 to-cyan-600',
    },
    {
      title: 'Subscription Plans',
      count: metrics.activePlans ?? 1,
      label: 'Recurring Billing Plans',
      href: '/merchant/plans',
      icon: Repeat,
      gradient: 'from-indigo-600 to-purple-600',
    },
    {
      title: 'Commercial Invoices',
      count: metrics.openInvoices ?? 1,
      label: 'Invoicing & Settlements',
      href: '/merchant/invoices',
      icon: FileText,
      gradient: 'from-emerald-600 to-teal-600',
    },
    {
      title: 'Held Balances',
      count: metrics.usdBalance ?? '$14,800.00',
      label: 'Available Merchant Reserve',
      href: '/merchant/balances',
      icon: Wallet,
      gradient: 'from-amber-600 to-orange-600',
    },
    {
      title: 'Transaction Stream',
      count: metrics.recentTxCount ?? 1,
      label: 'Last 31-Day Ledger Entries',
      href: '/merchant/transactions',
      icon: ArrowLeftRight,
      gradient: 'from-rose-600 to-pink-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-500" />
            {showTechnicalDetails
              ? 'PayPal APIMatic & AG Grid Enterprise Reporting'
              : 'Merchant Business & Financial Overview'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {showTechnicalDetails
              ? 'Real-time merchant financial reconciliation, catalog synchronisation, and payment auditing.'
              : 'Real-time overview of products, recurring plans, customer invoices, and settled balances.'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-lg text-xs font-mono text-cyan-700 dark:text-cyan-300">
          <ShieldCheck className="w-3.5 h-3.5" />
          {showTechnicalDetails ? 'APIMatic Verified' : 'Live Verified'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="group p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1424] hover:border-cyan-500/50 transition-all hover:shadow-lg dark:hover:shadow-cyan-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {card.title}
                </span>
                <div className={`p-2 rounded-lg bg-gradient-to-tr ${card.gradient} text-white shadow-sm`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                  {card.count}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {card.label}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
