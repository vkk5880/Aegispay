'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Sparkles,
  ArrowRight,
  User,
  Key,
} from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { webLogger as logger } from '@/lib/logger';

export interface PayPalRealSandboxAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'authorize';
}

export function PayPalRealSandboxAuthModal({
  isOpen,
  onClose,
  defaultMode = 'login',
}: PayPalRealSandboxAuthModalProps) {
  const { showTechnicalDetails } = useUiMode();
  const { user, isLoggedIn, isAuthorized, loginWithPayPal, authorizePayment } = useAuth();

  const [activeTab, setActiveTab] = useState<'live_window' | 'direct_credentials'>('live_window');
  const [emailInput, setEmailInput] = useState<string>('sb-buyer@personal.example.com');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSetupTokenId, setActiveSetupTokenId] = useState<string | null>(null);
  const [popupWindowRef, setPopupWindowRef] = useState<Window | null>(null);

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setStatusMessage(null);
      setIsLoading(false);
      if (user?.email) {
        setEmailInput(user.email);
        setNameInput(user.name);
      }
    }
  }, [isOpen, user]);

  // Listen for popup window message events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'PAYPAL_VAULT_SUCCESS') {
        const payload = event.data.data;
        logger.info('[PayPalAuthModal:Message] Received vault success from popup', payload);
        setStatusMessage('PayPal Sandbox Authorization confirmed!');
        setIsLoading(false);

        // Update local session via login callback
        loginWithPayPal({
          name: payload.user?.name || user?.name || 'PayPal Sandbox Buyer',
          email: payload.user?.email || user?.email || emailInput,
        });

        // Trigger authorize payment to update state
        authorizePayment();

        setTimeout(() => {
          onClose();
        }, 1500);
      } else if (event.data?.type === 'PAYPAL_VAULT_CANCELLED') {
        logger.warn('[PayPalAuthModal:Message] User cancelled PayPal sandbox popup');
        setIsLoading(false);
        setErrorMessage('PayPal login window was cancelled.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loginWithPayPal, authorizePayment, onClose, user, emailInput]);

  if (!isOpen) return null;

  // 1. Launch Live PayPal Sandbox Window
  const handleLaunchLiveSandboxWindow = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Connecting to PayPal Sandbox API & Minting Setup Token...');

    try {
      const res = await fetch('/api/auth/paypal/create-vault-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: user?.email ? `cust_${user.email.split('@')[0]}` : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to initiate PayPal Sandbox session');
      }

      setActiveSetupTokenId(data.setupTokenId);
      setStatusMessage('PayPal Sandbox token generated! Opening login window...');

      // Open centered popup
      const width = 520;
      const height = 680;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.approveUrl,
        'PayPalSandboxAuth',
        `width=${width},height=${height},left=${left},top=${top},status=yes,scrollbars=yes,resizable=yes`
      );

      setPopupWindowRef(popup);

      // Fallback polling in case postMessage is blocked
      const checkInterval = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(checkInterval);
          setIsLoading(false);

          // Verify status on close
          if (data.setupTokenId) {
            try {
              const verifyRes = await fetch('/api/auth/paypal/verify-vault-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setupTokenId: data.setupTokenId }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.isAuthorized) {
                setStatusMessage('Authorization confirmed via PayPal Sandbox API!');
                await loginWithPayPal(verifyData.user);
                await authorizePayment();
                setTimeout(() => onClose(), 1200);
              }
            } catch {}
          }
        }
      }, 1500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Failed to open PayPal Sandbox login.');
      logger.error('[PayPalAuthModal:Error] Failed to launch live sandbox window', {
        error: String(err),
      });
    }
  };

  // 2. Direct Sandbox Credentials Login
  const handleDirectSandboxLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) {
      setErrorMessage('Please enter a valid PayPal Sandbox email address.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Authenticating Sandbox Buyer Account...');

    try {
      const res = await fetch('/api/auth/paypal/sandbox-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          name: nameInput || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to authenticate PayPal Sandbox account');
      }

      logger.info('[PayPalAuthModal:DirectLogin] Direct login successful', data.user);
      await loginWithPayPal(data.user);

      if (defaultMode === 'authorize' || activeSetupTokenId) {
        setStatusMessage('Account logged in! Authorizing spend allowance on PayPal Sandbox...');
        await authorizePayment();
        setStatusMessage('Payment & spend allowance authorized successfully!');
      } else {
        setStatusMessage('Logged in with PayPal Sandbox Account!');
      }

      setIsLoading(false);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Login failed.');
      logger.error('[PayPalAuthModal:Error] Direct login failed', { error: String(err) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#091122] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden transition-all">
        {/* Top gradient highlight */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-500" />

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white flex items-center justify-center font-black shadow-md shadow-cyan-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>PayPal Sandbox Account</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  SANDBOX ONLY
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isLoggedIn && !isAuthorized
                  ? 'Authorize Spend Allowance & 1-Prompt Buying'
                  : 'Log in with real PayPal Sandbox buyer credentials'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Method Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#070d1a]/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('live_window')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'live_window'
                ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            <span>Live PayPal Window</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direct_credentials')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'direct_credentials'
                ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Direct Sandbox Account</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Status and Error banners */}
          {statusMessage && (
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300 text-xs flex items-center gap-2.5 animate-fade-in font-mono">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-cyan-500" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tab 1: Live PayPal Sandbox Window */}
          {activeTab === 'live_window' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Real PayPal Sandbox Authentication Experience</span>
                </div>
                <p>
                  Clicking below opens the official PayPal Sandbox sign-in window on{' '}
                  <strong className="font-mono text-cyan-600 dark:text-cyan-400">
                    sandbox.paypal.com
                  </strong>
                  . Enter your real PayPal sandbox buyer credentials to log in and approve spend
                  allowance.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleLaunchLiveSandboxWindow}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Opening PayPal Sandbox...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Live PayPal Sandbox Sign-In Window</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 font-mono">
                  Target Endpoint: https://www.sandbox.paypal.com/agreements/approve
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: Direct Sandbox Credentials Login */}
          {activeTab === 'direct_credentials' && (
            <form onSubmit={handleDirectSandboxLogin} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PayPal Sandbox Buyer Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="sb-buyer@personal.example.com"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070d18] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono"
                    />
                    <User className="absolute right-3.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                    Use any personal sandbox buyer from your PayPal Developer Dashboard.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Buyer Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070d18] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-cyan-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying with PayPal Sandbox...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authenticate Sandbox Account</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Dev Mode Technical Diagnostics */}
          {showTechnicalDetails && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-[#060b14]/70 border border-slate-200/80 dark:border-white/5 space-y-1.5 font-mono text-[10px]">
                <div className="flex justify-between text-slate-500">
                  <span>Target API:</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                    api-m.sandbox.paypal.com
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Vault Version:</span>
                  <span className="text-slate-700 dark:text-slate-300">PayPal Vault v3 REST</span>
                </div>
                {activeSetupTokenId && (
                  <div className="flex justify-between text-slate-500">
                    <span>Active Setup Token:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      {activeSetupTokenId}
                    </span>
                  </div>
                )}
                {user?.isAuthorized && (
                  <div className="flex justify-between text-slate-500">
                    <span>Vault Payment Token:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {user.vaultSetupTokenId || 'Active'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
