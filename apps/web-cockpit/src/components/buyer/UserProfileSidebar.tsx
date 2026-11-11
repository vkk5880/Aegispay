'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUiMode } from '@/context/UiModeContext';
import {
  X,
  User,
  ShieldCheck,
  CreditCard,
  Lock,
  LogOut,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Sliders,
  Mail,
  Zap,
} from 'lucide-react';

interface UserProfileSidebarProps {
  onOpenSettings?: () => void;
  isOpen?: boolean;
}

export function UserProfileSidebar({ onOpenSettings, isOpen }: UserProfileSidebarProps) {
  const {
    user,
    isLoggedIn,
    isAuthorized,
    isTestUserMode,
    canToggleTestUser,
    setTestUserMode,
    loginWithPayPal,
    authorizePayment,
    logout,
    isProfileSidebarOpen,
    closeProfileSidebar,
  } = useAuth();

  const { showTechnicalDetails } = useUiMode();
  const effectiveIsOpen = typeof isOpen === 'boolean' ? isOpen : isProfileSidebarOpen;

  if (!effectiveIsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={closeProfileSidebar}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-[#070e1c] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-[#1e293b] flex items-center justify-between bg-slate-50/80 dark:bg-[#050912]/80 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  User Profile & PayPal Account
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage your identity, test user status & payment authorization
                </p>
              </div>
            </div>
            <button
              onClick={closeProfileSidebar}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close profile sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. User Profile Details Card (when logged in) */}
            {isLoggedIn && user ? (
              <div className="bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-4">
                  {/* Profile Avatar / Icon */}
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-cyan-500/25">
                      {user.name.charAt(0)}
                    </div>
                    {isAuthorized && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0c1424] flex items-center justify-center text-white" title="Payment Authorized">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Name and Email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                        {user.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-mono">{user.email}</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {user.isTestUser ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px] font-mono font-bold">
                          Test User (Sandbox)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono font-bold">
                          PayPal Verified
                        </span>
                      )}

                      {isAuthorized ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono font-bold">
                          Payment: Authorized
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-[10px] font-mono font-bold">
                          Payment: Not Authorized
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Authorization Status Detail */}
                <div className="pt-3 border-t border-slate-200 dark:border-white/5 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Payment Status:</span>
                    <span className={isAuthorized ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
                      {isAuthorized ? 'Authorized (1-Prompt Active)' : 'Pending Authorization'}
                    </span>
                  </div>
                  {user.vaultSetupTokenId && (
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Vault Token:</span>
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                        {user.vaultSetupTokenId}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Logged-Out Prompt Card */
              <div className="bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center space-y-3 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 mx-auto flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                    Not Logged In
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Connect your PayPal account to synchronize orders, cart items, and savings.
                  </p>
                </div>
              </div>
            )}

            {/* 2. Primary Action Buttons */}
            <div className="space-y-3">
              {!isLoggedIn ? (
                /* Primary Button 1: Login with PayPal */
                <button
                  type="button"
                  onClick={async () => {
                    await loginWithPayPal();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login with PayPal</span>
                </button>
              ) : !isAuthorized ? (
                /* Primary Button 2: Authorize Payment */
                <button
                  type="button"
                  onClick={async () => {
                    await authorizePayment();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Authorize Payment</span>
                </button>
              ) : (
                /* Logged in and authorized status banner */
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>PayPal Payment & Spending Allowance Active!</span>
                </div>
              )}

              {/* Log Out Button */}
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              )}
            </div>

            {/* 3. Non-Production Mode: Enable Test User Card */}
            {canToggleTestUser && (
              <div className="border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Enable Test User
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestUserMode(!isTestUserMode)}
                    className="cursor-pointer text-cyan-600 dark:text-cyan-400 transition-transform active:scale-90"
                    aria-label="Toggle Test User Mode"
                  >
                    {isTestUserMode ? (
                      <ToggleRight className="w-7 h-7 text-cyan-500" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-slate-400" />
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {isTestUserMode ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      ✓ Test User is active: Bypasses live PayPal popups and automatically marks payment as authorized with sandbox credentials.
                    </span>
                  ) : (
                    <span>
                      When enabled, bypasses live PayPal authorization with simulated sandbox credentials. When disabled, behaves exactly like production.
                    </span>
                  )}
                </p>

                {isTestUserMode && (
                  <div className="bg-white/80 dark:bg-[#070e1c]/80 rounded-xl p-2.5 text-[11px] font-mono space-y-1 border border-cyan-500/20">
                    <div className="text-slate-500">Name: <span className="text-slate-900 dark:text-white font-bold">Alex Mercer</span></div>
                    <div className="text-slate-500">Email: <span className="text-slate-900 dark:text-white">alex.mercer@sandbox.paypal.com</span></div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">Status: Auto-Authorized (No Popup)</div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Link to Shopping & Delivery Settings */}
            {onOpenSettings && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    closeProfileSidebar();
                    onOpenSettings();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-white/10 hover:border-cyan-500/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center justify-between transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Shopping & Delivery Destination Settings</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#050912] text-center text-[11px] font-mono text-slate-500">
            AegisPay • Secure Identity & Vault v3 Protected
          </div>
        </div>
      </div>
    </div>
  );
}
