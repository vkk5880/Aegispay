'use client';

import React from 'react';
import {
  ShieldCheck,
  CreditCard,
  Sliders,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

interface SpendAllowanceHeaderProps {
  maxBudgetCents: number;
  spentCents: number;
  isConfigured: boolean;
  cartItemCount?: number;
  onOpenSettings: () => void;
  onConnectPayPal: () => void;
  onOpenCart?: () => void;
}

export function SpendAllowanceHeader({
  maxBudgetCents,
  spentCents,
  isConfigured,
  cartItemCount = 0,
  onOpenSettings,
  onConnectPayPal,
  onOpenCart,
}: SpendAllowanceHeaderProps) {
  const availableCents = Math.max(0, maxBudgetCents - spentCents);
  const spentPercent = Math.min(100, Math.round((spentCents / (maxBudgetCents || 1)) * 100));

  return (
    <div className="w-full">
      {/* Onboarding Banner if Unconfigured */}
      {!isConfigured && (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Connect PayPal to set your autonomous shopping allowance (One-Time Setup)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Authorize your agent with an Ed25519-signed spend mandate and one-time PayPal Vault v3 setup token.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onConnectPayPal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 shrink-0"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Connect PayPal Vault</span>
          </button>
        </div>
      )}

      {/* Main Persistent Spend Allowance Header Bar */}
      <div className="bg-white/80 dark:bg-[#070e1c]/80 border border-slate-200 dark:border-slate-800 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Spend Allowance Breakdown */}
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                  Max Spend Allowance
                </span>
                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {formatCents(maxBudgetCents)}
                </span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:border-slate-800 hidden sm:block" />

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                Spent / Authorized
              </span>
              <span className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                {formatCents(spentCents)}
              </span>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:border-slate-800 hidden sm:block" />

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                Available Balance
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {formatCents(availableCents)}
              </span>
            </div>
          </div>

          {/* Right: Progress & Settings Trigger */}
          <div className="flex items-center gap-3.5 justify-between md:justify-end">
            {/* Visual Budget Meter */}
            <div className="w-32 sm:w-40 space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span>Usage</span>
                <span>{spentPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    spentPercent > 80
                      ? 'bg-rose-500'
                      : spentPercent > 50
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                  }`}
                  style={{ width: `${spentPercent}%` }}
                />
              </div>
            </div>

            {/* Cart Trigger */}
            {onOpenCart && (
              <button
                type="button"
                onClick={onOpenCart}
                className="relative p-2 sm:px-3 sm:py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="View Explainable Multi-Vendor Cart"
              >
                <Sparkles className="w-4 h-4 text-cyan-500" />
                <span className="hidden sm:inline">Cart</span>
                {cartItemCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-600 text-white font-mono text-[10px] font-bold">
                    {cartItemCount}
                  </span>
                )}
              </button>
            )}

            {/* Settings Drawer Button */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Open Buyer Procurement Settings"
            >
              <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
