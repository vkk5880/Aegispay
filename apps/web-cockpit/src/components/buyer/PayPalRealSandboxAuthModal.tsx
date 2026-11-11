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
  LogIn,
  Sliders,
  DollarSign,
  Check,
} from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { webLogger as logger } from '@/lib/logger';
import { getClientOrigin } from '@/lib/origin';

export interface PayPalRealSandboxAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'authorize';
}

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2000];

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

  // Pre-authorization amount controls: by default disabled ($0) as specified
  const [enablePreauth, setEnablePreauth] = useState<boolean>(false);
  const [preauthAmount, setPreauthAmount] = useState<number>(500);
  const [preauthAmountInput, setPreauthAmountInput] = useState<string>('500');

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setStatusMessage(null);
      setIsLoading(false);
      // Default disabled ($0) on initial open unless user previously authorized
      setEnablePreauth(defaultMode === 'authorize');
      setPreauthAmount(500);
      setPreauthAmountInput('500');
      if (user?.email) {
        setEmailInput(user.email);
        setNameInput(user.name);
      }
    }
  }, [isOpen, user, defaultMode]);

  // Handle toggling pre-authorization switch
  const handleTogglePreauth = () => {
    setEnablePreauth((prev) => {
      const nextState = !prev;
      if (nextState && (!preauthAmount || preauthAmount <= 0)) {
        setPreauthAmount(500);
        setPreauthAmountInput('500');
      }
      return nextState;
    });
  };

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setPreauthAmount(val);
    setPreauthAmountInput(String(val));
  };

  // Handle manual amount input change
  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setPreauthAmountInput(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) {
      setPreauthAmount(Math.round(parsed));
    }
  };

  // Handle preset pill click
  const handleSelectPreset = (amount: number) => {
    setPreauthAmount(amount);
    setPreauthAmountInput(String(amount));
  };

  // Listen for popup window message events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'PAYPAL_VAULT_SUCCESS') {
        const payload = event.data.data;
        logger.info('[PayPalAuthModal:Message] Received vault success from popup', payload);
        setStatusMessage('PayPal Sandbox Authorization confirmed!');
        setIsLoading(false);

        // Close popup window if still open
        if (popupWindowRef && !popupWindowRef.closed) {
          popupWindowRef.close();
        }

        // Update local session via login callback
        await loginWithPayPal({
          name: payload.user?.name || user?.name || 'PayPal Sandbox Buyer',
          email: payload.user?.email || user?.email || emailInput,
        });

        // If pre-authorization was selected, authorize with chosen amount
        if (enablePreauth && preauthAmount > 0) {
          await authorizePayment(Math.round(preauthAmount * 100));
        }

        // Close login prompt and refresh UI
        onClose();
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }, 200);
      } else if (
        event.data?.type === 'PAYPAL_VAULT_CANCELLED' ||
        event.data?.type === 'PAYPAL_VAULT_ERROR' ||
        event.data?.type === 'PAYPAL_VAULT_FAILED'
      ) {
        logger.warn('[PayPalAuthModal:Message] User cancelled or failed PayPal sandbox login');
        setIsLoading(false);
        if (popupWindowRef && !popupWindowRef.closed) {
          popupWindowRef.close();
        }
        // Requirement: Close login prompt even if failed
        onClose();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loginWithPayPal, authorizePayment, onClose, user, emailInput, enablePreauth, preauthAmount, popupWindowRef]);

  if (!isOpen) return null;

  // 1. Launch Live PayPal Sandbox Window
  const handleLaunchLiveSandboxWindow = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Connecting to PayPal Sandbox API & Minting Setup Token...');

    try {
      const clientOrigin = getClientOrigin();
      const res = await fetch('/api/auth/paypal/create-vault-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: user?.email ? `cust_${user.email.split('@')[0]}` : undefined,
          origin: clientOrigin,
          returnUrl: `${clientOrigin}/auth/vault-callback`,
          cancelUrl: `${clientOrigin}/auth/vault-callback?cancelled=true`,
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

      // Polling check to close login prompt when popup closes
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
                if (enablePreauth && preauthAmount > 0) {
                  await authorizePayment(Math.round(preauthAmount * 100));
                }
                onClose();
                setTimeout(() => {
                  if (typeof window !== 'undefined') window.location.reload();
                }, 200);
                return;
              }
            } catch {}
          }
          // Close login prompt if closed without success
          onClose();
        }
      }, 1500);
    } catch (err: any) {
      setIsLoading(false);
      logger.error('[PayPalAuthModal:Error] Failed to launch live sandbox window', {
        error: String(err),
      });
      // Close prompt even if failed
      onClose();
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
      const clientOrigin = getClientOrigin();
      const res = await fetch('/api/auth/paypal/sandbox-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          name: nameInput || undefined,
          origin: clientOrigin,
          returnUrl: `${clientOrigin}/auth/vault-callback`,
          cancelUrl: `${clientOrigin}/auth/vault-callback?cancelled=true`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to authenticate PayPal Sandbox account');
      }

      logger.info('[PayPalAuthModal:DirectLogin] Direct login successful', data.user);
      await loginWithPayPal(data.user);

      if (enablePreauth && preauthAmount > 0) {
        setStatusMessage(`Account logged in! Authorizing $${preauthAmount} spend allowance...`);
        await authorizePayment(Math.round(preauthAmount * 100));
        setStatusMessage('Payment & spend allowance authorized successfully!');
      } else {
        setStatusMessage('Logged in with PayPal Sandbox Account!');
      }

      setIsLoading(false);
      onClose();
      // Refresh page or UI if login success
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload();
      }, 200);
    } catch (err: any) {
      setIsLoading(false);
      logger.error('[PayPalAuthModal:Error] Direct login failed', { error: String(err) });
      // Close login prompt even if failed
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8 lg:p-12 bg-slate-950/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      {/* Container covering full window with beautiful margin */}
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-[#070e1d] border border-slate-200/90 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden transition-all my-auto">
        {/* Top vibrant gradient accent line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-500" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-white/80 dark:bg-[#081022]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 text-white flex items-center justify-center font-black shadow-lg shadow-cyan-500/25">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Login
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  PAYPAL SANDBOX
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign in with PayPal Sandbox credentials & configure optional 1-prompt pre-authorized spend allowance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
          {/* Status Message Banner */}
          {statusMessage && (
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300 text-xs flex items-center gap-2.5 animate-fade-in font-mono">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-cyan-500" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* =========================================================================
              PRE-AUTHORIZE AMOUNT SECTION (SHOWN ABOVE LOGIN ACTIONS)
              Default: Disabled or $0. If enabled, defaults to $500 with slider and input.
             ========================================================================= */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-cyan-50/60 via-white to-blue-50/40 dark:from-[#09152e]/60 dark:via-[#070e1c]/80 dark:to-[#050b16] border border-cyan-200/80 dark:border-cyan-500/20 shadow-xs space-y-4">
            {/* Section Header & Toggle Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Pre-authorize Spend Allowance</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                      1-Prompt Buying
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Authorize an upfront spend cap with PayPal Vault v3 so your shopping assistant can buy instantly without repetitive approval modals.
                  </p>
                </div>
              </div>

              {/* Toggle Switch Button */}
              <button
                type="button"
                onClick={handleTogglePreauth}
                className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/50 self-start sm:self-center ${
                  enablePreauth ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                role="switch"
                aria-checked={enablePreauth}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enablePreauth ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Inactive State: Disabled ($0) */}
            {!enablePreauth ? (
              <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>
                    Spend Pre-authorization is <strong>Disabled ($0 Allowance)</strong>. You will log in with browsing & search permissions only.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleTogglePreauth}
                  className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0 ml-2"
                >
                  Enable $500 Cap
                </button>
              </div>
            ) : (
              /* Active State: Slider & Amount Input Controls */
              <div className="space-y-4 pt-1 animate-fade-in">
                {/* Active Amount Display & Quick Presets */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Selected Pre-authorized Cap
                    </span>
                    <div className="text-3xl font-black font-mono text-cyan-600 dark:text-cyan-400 flex items-baseline gap-1">
                      <span>${preauthAmount.toLocaleString()}</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">USD</span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_AMOUNTS.map((amt) => {
                      const isSelected = preauthAmount === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleSelectPreset(amt)}
                          className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-600 text-white shadow-xs'
                              : 'bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50'
                          }`}
                        >
                          ${amt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slider Control */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span>$50 Min</span>
                    <span className="font-bold text-cyan-600 dark:text-cyan-400">$500 (Default)</span>
                    <span>$2,500 Max</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2500"
                    step="25"
                    value={preauthAmount}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                {/* Custom Amount Input Box */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    Or Enter Exact Amount:
                  </label>
                  <div className="relative flex-1 max-w-[200px]">
                    <span className="absolute left-3 top-2 text-sm font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      placeholder="500"
                      value={preauthAmountInput}
                      onChange={handleAmountInputChange}
                      className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070d18] text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    ({preauthAmount * 100} cents)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
              AUTHENTICATION TABS & LOGIN ACTIONS
             ========================================================================= */}
          <div className="space-y-4">
            {/* Method Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#070d1a]/70 p-1 rounded-2xl">
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

            {/* Tab 1: Live PayPal Sandbox Sign-In Window */}
            {activeTab === 'live_window' && (
              <div className="space-y-4 pt-1">
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Live PayPal Sandbox Window Experience</span>
                  </div>
                  <p>
                    Clicking below initiates a verified PayPal Sandbox session and opens the official sign-in window on{' '}
                    <strong className="font-mono text-cyan-600 dark:text-cyan-400">
                      sandbox.paypal.com
                    </strong>
                    . The login window will close automatically once completed or if cancelled, and AegisPay will immediately synchronize.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleLaunchLiveSandboxWindow}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl shadow-cyan-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Opening PayPal Sandbox Window...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5" />
                      <span>
                        {enablePreauth
                          ? `Complete Login & Pre-authorize $${preauthAmount}`
                          : 'Complete Login ($0 Spend Allowance)'}
                      </span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 font-mono">
                  Endpoint: https://www.sandbox.paypal.com/agreements/approve
                </p>
              </div>
            )}

            {/* Tab 2: Direct Sandbox Credentials Login */}
            {activeTab === 'direct_credentials' && (
              <form onSubmit={handleDirectSandboxLogin} className="space-y-4 pt-1">
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
                      Use any personal sandbox buyer account from your PayPal Developer Dashboard.
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
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl shadow-cyan-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Verifying with PayPal Sandbox...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>
                        {enablePreauth
                          ? `Complete Login & Pre-authorize $${preauthAmount}`
                          : 'Complete Login ($0 Spend Allowance)'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

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
                  <span>Pre-authorization State:</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {enablePreauth ? `Active ($${preauthAmount} / ${preauthAmount * 100} cents)` : 'Disabled ($0)'}
                  </span>
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
