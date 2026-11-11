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
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';

export interface SpendAllowanceHeaderProps {
  maxBudgetCents: number;
  spentCents: number;
  isConfigured: boolean;
  isIdentityOnly?: boolean;
  cartItemCount?: number;
  onOpenSettings: () => void;
  onConnectPayPal: () => void;
  onSignInPayPalZeroDollar?: () => void;
  onOpenCart?: () => void;
}

export function SpendAllowanceHeader({
  maxBudgetCents,
  spentCents,
  isConfigured,
  isIdentityOnly = false,
  cartItemCount = 0,
  onOpenSettings,
  onConnectPayPal,
  onSignInPayPalZeroDollar,
  onOpenCart,
}: SpendAllowanceHeaderProps) {
  const { showTechnicalDetails } = useUiMode();
  const auth = useAuth();
  const [selectedCapCents, setSelectedCapCents] = React.useState<number>(25000);

  const isUserLoggedIn = auth.isLoggedIn;
  // Security rule: Payment is authorized only if the user is actively logged in and authorized with PayPal.
  const isPaymentAuthorized = auth.isLoggedIn && auth.isAuthorized;

  const displayMaxBudgetCents = isPaymentAuthorized
    ? maxBudgetCents
    : showTechnicalDetails
    ? maxBudgetCents
    : 0;
  const availableCents = Math.max(0, displayMaxBudgetCents - spentCents);
  const spentPercent = isPaymentAuthorized
    ? Math.min(100, Math.round((spentCents / (displayMaxBudgetCents || 1)) * 100))
    : 0;

  return (
    <div className="w-full">
      {/* Read-Only Tracking Link Mode Banner */}
      {auth.isTrackingMode && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Read-Only Tracking Session Active</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-mono font-bold">
                READ ONLY
              </span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Viewing order shipment status via secure tracking token. Placing new orders and editing spend allowance are disabled in read-only mode.
            </p>
          </div>
        </div>
      )}

      {/* Dual-Mode Side-by-Side Connection Cards (Section 4 Specification) */}
      {!isPaymentAuthorized && !auth.isTrackingMode && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-[#0c1424]/90 border border-slate-200/80 dark:border-white/10 backdrop-blur-xl shadow-lg">
          <div className="text-center mb-4">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-500" />
              <span>Connect with PayPal Sandbox</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose your interaction model: Zero-cost identity sign-in or autonomous agentic purchasing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode A: 1-Click Sign-In ($0) */}
            <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
              isUserLoggedIn && !isPaymentAuthorized
                ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-400/40 ring-1 ring-blue-500/30'
                : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                      A
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      1-Click Sign-In ($0)
                    </span>
                  </div>
                  {isUserLoggedIn && !isPaymentAuthorized && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 mb-4 font-mono">
                  <li className="flex items-center gap-1.5">
                    <span className="text-blue-500">•</span> Cost: <strong>$0.00 (Zero charge)</strong>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-blue-500">•</span> Restores past order history
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-blue-500">•</span> Syncs across Chrome, Edge, Phone
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-blue-500">•</span> Zero autonomous spend rights
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-blue-500">•</span> Safe for casual browsing
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!isUserLoggedIn) {
                    await auth.loginWithPayPal();
                  }
                  if (onSignInPayPalZeroDollar) onSignInPayPalZeroDollar();
                  onConnectPayPal();
                }}
                disabled={isUserLoggedIn}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  isUserLoggedIn
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-default'
                    : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-sm cursor-pointer active:scale-95'
                }`}
              >
                <span>{isUserLoggedIn ? 'Identity Connected ($0)' : 'Continue with $0 Sign-In'}</span>
              </button>
            </div>

            {/* Mode B: Agentic Spend Allowance */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent border border-cyan-500/30 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs">
                      B
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Agentic Spend Allowance
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono font-bold">
                    AUTONOMOUS BUY
                  </span>
                </div>

                <div className="mb-2.5">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Select Allowance Cap:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[10000, 25000, 50000].map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => setSelectedCapCents(cap)}
                        className={`py-1 px-2 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                          selectedCapCents === cap
                            ? 'bg-cyan-600 text-white shadow-xs'
                            : 'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-cyan-500/40'
                        }`}
                      >
                        ${cap / 100}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 mb-4 font-mono">
                  <li className="flex items-center gap-1.5">
                    <span className="text-cyan-500">•</span> Mints Ed25519 WebCrypto Mandate
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-cyan-500">•</span> Enables 1-Prompt Autonomous Buy
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-cyan-500">•</span> Atomic Redis Lua Spend Shield
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-cyan-500">•</span> 24-Hour Expiration Protection
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await auth.authorizePayment(selectedCapCents);
                  onConnectPayPal();
                }}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Authorize Spending Allowance (${selectedCapCents / 100})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Persistent Spend Allowance Header Bar */}
      <div className="relative group bg-white/95 dark:bg-[#0c1424]/90 border border-slate-200/80 dark:border-white/10 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/5 dark:shadow-black/20 transition-all overflow-hidden">
        {/* Top radiant line */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/20 via-cyan-400 to-blue-500/20" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Spend Allowance Breakdown */}
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                    {showTechnicalDetails ? 'Max Spend Allowance' : 'Spending Limit'}
                  </span>
                  {showTechnicalDetails && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      SANDBOX
                    </span>
                  )}
                  {isPaymentAuthorized && !showTechnicalDetails && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                  )}
                </div>
                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {isPaymentAuthorized
                    ? formatCents(maxBudgetCents)
                    : showTechnicalDetails
                    ? formatCents(maxBudgetCents)
                    : 'Not Configured'}
                </span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200/80 dark:bg-white/10 hidden sm:block" />

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                {showTechnicalDetails ? 'Spent / Authorized' : 'Spent So Far'}
              </span>
              <span className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                {formatCents(spentCents)}
              </span>
            </div>

            <div className="h-8 w-px bg-slate-200/80 dark:bg-white/10 hidden sm:block" />

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                {showTechnicalDetails ? 'Available Balance' : 'Remaining Budget'}
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {isPaymentAuthorized || showTechnicalDetails
                  ? formatCents(availableCents)
                  : '--'}
              </span>
            </div>
          </div>

          {/* Right: Progress & Settings Trigger */}
          <div className="flex items-center gap-3.5 justify-between md:justify-end">
            {/* Visual Budget Meter */}
            <div className="w-32 sm:w-40 space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                <span>Usage</span>
                <span>{spentPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    spentPercent > 80
                      ? 'bg-gradient-to-r from-rose-500 to-red-600'
                      : spentPercent > 50
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                  }`}
                  style={{ width: `${spentPercent}%` }}
                />
              </div>
            </div>

            {/* Settings Drawer Button (Sandboxed/Disabled in Tracking Mode) */}
            {!auth.isTrackingMode ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                title="Open Buyer Procurement Settings"
              >
                <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Read-Only</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
