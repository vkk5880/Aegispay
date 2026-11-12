'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Lock,
  ShieldCheck,
  CreditCard,
  Sliders,
  ShoppingBag,
  Receipt,
  Bookmark,
  Store,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  LogIn,
  AlertCircle,
  ExternalLink,
  Wallet,
  Zap,
  Code,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';

export interface BuyerSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  maxBudgetCents: number;
  spentCents: number;
  onOpenSettings: () => void;
  onConnectPayPal: () => void;
  onOpenCart: () => void;
  cartItemCount?: number;
}

export function BuyerSidebar({
  isOpen,
  onToggle,
  maxBudgetCents,
  spentCents,
  onOpenSettings,
  onConnectPayPal,
  onOpenCart,
  cartItemCount = 0,
}: BuyerSidebarProps) {
  const { showTechnicalDetails, toggleTechnicalDetails } = useUiMode();
  const auth = useAuth();
  const { totalItemsCount } = useCart();
  const [isQuickAccessOpen, setIsQuickAccessOpen] = useState<boolean>(true);

  const isUserLoggedIn = auth.isLoggedIn;
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

  const effectiveCartCount = totalItemsCount > 0 ? totalItemsCount : cartItemCount;

  return (
    <>
      {/* Mobile Backdrop Overlay (Auto-hides when clicked outside) */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`
          fixed lg:static top-14 lg:top-0 bottom-0 left-0 z-40 lg:z-10
          h-[calc(100dvh-3.5rem)] lg:h-full min-h-0 max-h-full bg-white dark:bg-[#070e1c] border-r border-slate-200/80 dark:border-white/10
          flex flex-col transition-all duration-300 ease-in-out overflow-hidden
          ${
            isOpen
              ? 'w-72 xl:w-80 shadow-2xl lg:shadow-none translate-x-0'
              : '-translate-x-full lg:translate-x-0 lg:w-12'
          }
        `}
      >
        {/* Expanded Content View */}
        {isOpen ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Header / Collapse Toolbar */}
            <div className="p-3.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-[#060c18]/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Budget & Account
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {showTechnicalDetails ? 'Spend Mandate Rail' : 'Autonomous Envelope'}
                  </span>
                </div>
              </div>

              {/* Close / Collapse Button */}
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4 hidden lg:block" />
                <X className="w-4 h-4 lg:hidden" />
              </button>
            </div>

            {/* Scrollable Body: Budget Cards & User Actions */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3.5 space-y-4 touch-pan-y scroll-smooth pb-8">
              {/* Account / PayPal Status Card */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a1224] border border-slate-200/70 dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                    PayPal Status
                  </span>
                  {isPaymentAuthorized ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                  ) : isUserLoggedIn ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      AUTH NEEDED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      UNCONNECTED
                    </span>
                  )}
                </div>

                {isUserLoggedIn ? (
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {auth.user?.name || 'Sandbox Buyer'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      {auth.user?.email || 'buyer@sandbox.paypal.com'}
                    </div>
                    {!isPaymentAuthorized && (
                      <button
                        type="button"
                        onClick={onConnectPayPal}
                        className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Authorize Payment</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Connect PayPal Sandbox for 1-click agentic shopping and instant cashback.
                    </p>
                    <button
                      type="button"
                      onClick={onConnectPayPal}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Connect with PayPal</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Vertical Budget Envelope Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                    Spend Envelope
                  </span>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Settings</span>
                  </button>
                </div>

                {/* 1. Spending Limit Card */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0a1224] border border-slate-200/70 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                        Spending Limit
                      </span>
                      <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                        {isPaymentAuthorized || showTechnicalDetails
                          ? formatCents(maxBudgetCents)
                          : 'Not Configured'}
                      </span>
                    </div>
                  </div>
                  {isPaymentAuthorized && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      CAP
                    </span>
                  )}
                </div>

                {/* 2. Spent So Far Card */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0a1224] border border-slate-200/70 dark:border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                      Spent So Far
                    </span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                      {formatCents(spentCents)}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {spentPercent}% used
                  </span>
                </div>

                {/* 3. Remaining Budget Card */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-700 dark:text-emerald-300 block font-bold">
                      Remaining Budget
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                      {isPaymentAuthorized || showTechnicalDetails
                        ? formatCents(availableCents)
                        : '--'}
                    </span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                {/* 4. Visual Usage Meter */}
                <div className="space-y-1 pt-1">
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden p-0.5">
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

                {/* Settings Trigger Button */}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Configure Spend Rules & Caps</span>
                </button>
              </div>

              {/* User Related App Navigation Links (Collapsible) */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsQuickAccessOpen(!isQuickAccessOpen)}
                  className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer py-1 select-none"
                  title={isQuickAccessOpen ? 'Collapse Quick Access' : 'Expand Quick Access'}
                >
                  <span className="flex items-center gap-1.5">
                    <span>Quick Access</span>
                    {effectiveCartCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-cyan-600 text-white text-[9px] font-mono font-bold">
                        {effectiveCartCount}
                      </span>
                    )}
                  </span>
                  {isQuickAccessOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {isQuickAccessOpen && (
                  <div className="space-y-1.5 animate-fade-in">
                    {/* Multi-Store Cart */}
                    <button
                      type="button"
                      onClick={onOpenCart}
                      className="w-full p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <span>Consolidated Cart</span>
                      </div>
                      {effectiveCartCount > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-cyan-600 text-white text-[10px] font-mono font-bold">
                          {effectiveCartCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Empty</span>
                      )}
                    </button>

                    {/* Orders & Receipts */}
                    <Link
                      href="/history"
                      prefetch={false}
                      className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Orders & Receipts</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>

                    {/* Saved Watchlist */}
                    <Link
                      href="/watchlist"
                      className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Bookmark className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Saved Watchlist</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>

                    {/* Merchant Portal */}
                    <Link
                      href="/merchant"
                      className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Store className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Seller Dashboard</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Developer & Inspector Mode Strip */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-white/10">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0a1224] border border-slate-200/70 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Code className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block leading-tight truncate">
                        Developer Mode
                      </span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono block">
                        {showTechnicalDetails ? 'Inspector active' : 'Shopper view'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTechnicalDetails}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-colors border shrink-0 ${
                      showTechnicalDetails
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {showTechnicalDetails ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-[#060c18]/50 text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                <span>Protected by PayPal</span>
              </span>
              <span>2026</span>
            </div>
          </div>
        ) : (
          /* Collapsed Narrow Icon Rail (Desktop) */
          <div className="hidden lg:flex flex-col items-center justify-between h-full py-3">
            {/* Expand Toggle */}
            <button
              type="button"
              onClick={onToggle}
              className="p-2 rounded-lg text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
              title="Expand Budget & Menu"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Icon Shortcuts */}
            <div className="space-y-3 flex flex-col items-center">
              <button
                type="button"
                onClick={onToggle}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors relative"
                title={`Budget Remaining: ${isPaymentAuthorized || showTechnicalDetails ? formatCents(availableCents) : '--'}`}
              >
                <Wallet className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                title="Procurement Settings"
              >
                <Sliders className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>

              <button
                type="button"
                onClick={onOpenCart}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors relative"
                title="Consolidated Cart"
              >
                <ShoppingBag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                {effectiveCartCount > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-cyan-500" />
                )}
              </button>

              <Link
                href="/history"
                prefetch={false}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                title="Orders & Receipts"
              >
                <Receipt className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </Link>
            </div>

            {/* Bottom Status Dot */}
            <div className="w-2 h-2 rounded-full bg-emerald-500" title="System Ready" />
          </div>
        )}
      </aside>
    </>
  );
}
