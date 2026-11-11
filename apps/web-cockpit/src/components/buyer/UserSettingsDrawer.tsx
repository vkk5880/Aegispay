'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Sliders,
  Save,
  RotateCcw,
  CheckCircle2,
  Building,
  Bot,
  Sparkles,
  Lock,
  Key,
  Code,
  Eye,
  EyeOff,
  User,
  Mail,
  CreditCard,
  LogIn,
  ToggleLeft,
  ToggleRight,
  Zap,
  AlertTriangle,
  Loader2,
  Search,
  Store,
  Filter,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth, DEFAULT_ALLOWED_CATEGORIES, DEFAULT_ALLOWED_MERCHANTS } from '@/context/AuthContext';
import { AVAILABLE_CATEGORIES } from './PayPalRealSandboxAuthModal';

export interface CommerceModelUIOption {
  id: string;
  name: string;
  provider: 'google' | 'anthropic' | 'openai' | 'custom';
  badge: string;
  desc: string;
  requiresKey: boolean;
}

export const COMMERCE_MODELS: CommerceModelUIOption[] = [
  {
    id: 'google/gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'google',
    badge: 'Default & Recommended',
    desc: 'Ultra-low latency sub-second tool execution with 1M context window. Pre-configured platform key.',
    requiresKey: false,
  },
  {
    id: 'google/gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B',
    provider: 'google',
    badge: 'Gemma Platform',
    desc: 'Open-weights dense reasoning using pre-configured platform credentials. No user key required.',
    requiresKey: false,
  },
  {
    id: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'google',
    badge: 'Gemma High-Accuracy',
    desc: 'High-accuracy open model for detailed attribute comparison. No user key required.',
    requiresKey: false,
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    badge: 'BYOK Required',
    desc: 'Premier schema verification and tool synthesis. Requires user-scoped personal API key.',
    requiresKey: true,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    badge: 'BYOK Required',
    desc: 'Omni-channel conversational intelligence with high flexibility. Requires user-scoped personal API key.',
    requiresKey: true,
  },
];

export interface UserSettings {
  // Delivery Address
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;

  // Advanced / Developer Mode (Hidden for normal shoppers)
  developerModeEnabled: boolean;
  aiModel?: string;
  userApiKey?: string;

  // Fulfillment & Protection Mode
  fulfillmentMode: 'PRICE_WATCHER_72H' | 'PRIORITY_EXPRESS';

  // Purchasing Rules
  purchasingRule: 'ALWAYS_CONFIRM' | 'AUTO_BUY_BELOW_THRESHOLD';
  autoBuyThresholdCents: number;

  // Single-Merchant Exposure Cap
  singleMerchantExposureCapCents: number;

  // Security Controls: Authorized Categories and Whitelisted Stores
  allowedCategories?: string[];
  allowedMerchants?: string[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  streetAddress: '2211 North First Street',
  city: 'San Jose',
  state: 'CA',
  zipCode: '95131',
  developerModeEnabled: false,
  aiModel: 'google/gemini-3.5-flash-lite',
  userApiKey: '',
  fulfillmentMode: 'PRICE_WATCHER_72H',
  purchasingRule: 'ALWAYS_CONFIRM',
  autoBuyThresholdCents: 15000, // $150.00
  singleMerchantExposureCapCents: 35000, // $350.00
  allowedCategories: DEFAULT_ALLOWED_CATEGORIES,
  allowedMerchants: DEFAULT_ALLOWED_MERCHANTS,
};

interface UserSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  maxBudgetCents?: number;
  onSave: (newSettings: UserSettings) => void;
}

export function UserSettingsDrawer({
  isOpen,
  onClose,
  settings: initialSettings,
  maxBudgetCents = 50000,
  onSave,
}: UserSettingsDrawerProps) {
  const { isProduction, showTechnicalDetails, setShowTechnicalDetails } = useUiMode();
  const {
    user,
    isLoggedIn,
    isAuthorized,
    loginWithPayPal,
    authorizePayment,
    updateSpendSecuritySettings,
    revokePaymentAuthorization,
  } = useAuth();
  const [formData, setFormData] = useState<UserSettings>(initialSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Security whitelist controls
  const [whitelistMode, setWhitelistMode] = useState<boolean>(true);
  const [merchantSearchQuery, setMerchantSearchQuery] = useState<string>('');
  const [availableMerchants, setAvailableMerchants] = useState<any[]>([]);
  const [isSearchingMerchants, setIsSearchingMerchants] = useState<boolean>(false);

  useEffect(() => {
    const isAll = user?.allowedMerchants?.includes('*');
    setFormData({
      ...initialSettings,
      aiModel: initialSettings.aiModel || 'google/gemini-3.5-flash-lite',
      developerModeEnabled: initialSettings.developerModeEnabled || showTechnicalDetails,
      allowedCategories: user?.allowedCategories || initialSettings.allowedCategories || DEFAULT_ALLOWED_CATEGORIES,
      allowedMerchants: isAll ? DEFAULT_ALLOWED_MERCHANTS : (user?.allowedMerchants || initialSettings.allowedMerchants || DEFAULT_ALLOWED_MERCHANTS),
    });
    setWhitelistMode(!isAll);
    setVerificationError(null);
  }, [initialSettings, isOpen, showTechnicalDetails, user]);

  // Fetch merchants for search
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    const fetchMerchants = async () => {
      setIsSearchingMerchants(true);
      try {
        const q = merchantSearchQuery.trim();
        const res = await fetch(`/api/buyer/merchants?query=${encodeURIComponent(q)}&limit=15`);
        if (!res.ok) throw new Error('Failed to query merchants');
        const data = await res.json();
        if (!isCancelled && Array.isArray(data.merchants)) {
          setAvailableMerchants(data.merchants);
        }
      } catch {
      } finally {
        if (!isCancelled) setIsSearchingMerchants(false);
      }
    };

    const timer = setTimeout(fetchMerchants, 200);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, merchantSearchQuery]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);

    const activeModelId = formData.aiModel || 'google/gemini-3.5-flash-lite';
    const selectedModelObj = COMMERCE_MODELS.find((m) => m.id === activeModelId);
    const isKeyRequired = selectedModelObj?.requiresKey ?? (!activeModelId.startsWith('google/'));
    const hasKey = Boolean(formData.userApiKey && formData.userApiKey.trim().length > 0);

    // If key is required for this model but not provided:
    if (isKeyRequired && !hasKey) {
      setVerificationError(
        `An API key is required to use ${selectedModelObj?.name || 'this non-default model'}. Please enter a valid API key below, or select Gemini / Gemma.`
      );
      return;
    }

    // If a key was provided (either required or optional), verify it against the provider endpoint
    if (hasKey) {
      setIsVerifying(true);
      try {
        const provider =
          selectedModelObj?.provider ||
          (activeModelId.includes('anthropic')
            ? 'anthropic'
            : activeModelId.includes('openai')
            ? 'openai'
            : 'google');

        const res = await fetch('/api/buyer/verify-llm-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey: formData.userApiKey?.trim(),
            model: activeModelId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.valid) {
          setVerificationError(
            data.error ||
              `The provided ${provider.toUpperCase()} API key could not be verified. Settings were not saved.`
          );
          setIsVerifying(false);
          return;
        }
      } catch (err: any) {
        setVerificationError(
          `Could not connect to verification endpoint: ${err?.message || 'Network error'}`
        );
        setIsVerifying(false);
        return;
      }
      setIsVerifying(false);
    }

    // Key is verified (or platform default model was chosen): proceed with saving
    const effectiveCats = formData.allowedCategories && formData.allowedCategories.length > 0
      ? formData.allowedCategories
      : DEFAULT_ALLOWED_CATEGORIES;
    const effectiveMerchants = whitelistMode ? (formData.allowedMerchants || DEFAULT_ALLOWED_MERCHANTS) : ['*'];

    const updatedFormData: UserSettings = {
      ...formData,
      allowedCategories: effectiveCats,
      allowedMerchants: effectiveMerchants,
    };

    await updateSpendSecuritySettings(effectiveCats, effectiveMerchants);
    onSave(updatedFormData);
    setShowTechnicalDetails(formData.developerModeEnabled);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setFormData(DEFAULT_USER_SETTINGS);
    setVerificationError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-[#070e1c] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-[#1e293b] flex items-center justify-between bg-slate-50/60 dark:bg-[#050912]/60">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>{showTechnicalDetails ? 'Buyer Procurement Settings' : 'Shopping & Delivery Settings'}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure delivery destination, price-drop protection & spend rules
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <form id="settings-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* User Profile & PayPal Account Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-3 shadow-xs">
              {isLoggedIn && user ? (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-cyan-500/20">
                      {user.name.charAt(0)}
                    </div>
                    {isAuthorized && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0c1424] flex items-center justify-center text-white">
                        <CheckCircle2 className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {user.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[9px] font-mono font-bold">
                        PayPal Sandbox Connected
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                          isAuthorized
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isAuthorized ? 'Payment Authorized' : 'Not Authorized'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Guest Buyer</div>
                      <div className="text-[10px] text-slate-500">Not signed in with PayPal</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => loginWithPayPal()}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs shadow-xs cursor-pointer active:scale-95"
                  >
                    Login with PayPal
                  </button>
                </div>
              )}

              {/* Authorize button if logged in but payment not yet authorized */}
              {isLoggedIn && !isAuthorized && (
                <button
                  type="button"
                  onClick={() => authorizePayment()}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Authorize Payment</span>
                </button>
              )}

              {/* Revoke Spend Allowance button if authorized (1-click drop to Mode A $0 Identity Only) */}
              {isLoggedIn && isAuthorized && (
                <button
                  type="button"
                  onClick={() => revokePaymentAuthorization()}
                  className="w-full py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 border border-slate-300/80 dark:border-white/10 transition-colors"
                  title="Revoke active spend mandate and drop back to Mode A ($0 Identity Only)"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Revoke Spend Allowance (Drop to $0 Sign-In)</span>
                </button>
              )}
            </div>

            {/* Section 1: Delivery Destination */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-500" />
                <span>Delivery Address (Used for Postal Tax Calculation)</span>
              </label>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={formData.streetAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, streetAddress: e.target.value })
                    }
                    placeholder="2211 North First Street"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-6 gap-2">
                  <div className="col-span-3">
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      placeholder="San Jose"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      required
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) =>
                        setFormData({ ...formData, state: e.target.value.toUpperCase() })
                      }
                      maxLength={2}
                      placeholder="CA"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white uppercase font-mono text-center focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                      Postal ZIP
                    </label>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) =>
                        setFormData({ ...formData, zipCode: e.target.value })
                      }
                      placeholder="95131"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Fulfillment & Protection Mode */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span>Fulfillment & Escrow Protection</span>
              </label>

              <div className="space-y-2">
                {/* Mode 1: 72-Hour Smart Price Watcher */}
                <div
                  onClick={() =>
                    setFormData({ ...formData, fulfillmentMode: 'PRICE_WATCHER_72H' })
                  }
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    formData.fulfillmentMode === 'PRICE_WATCHER_72H'
                      ? 'border-cyan-500/60 bg-cyan-50/50 dark:bg-cyan-950/20 shadow-xs ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#050912]/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="fulfillmentMode"
                      checked={formData.fulfillmentMode === 'PRICE_WATCHER_72H'}
                      onChange={() =>
                        setFormData({ ...formData, fulfillmentMode: 'PRICE_WATCHER_72H' })
                      }
                      className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>72-Hour Smart Price Watcher</span>
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Places a PayPal conditional authorization hold. If Channel3 or competing vendors drop price within 72 hours, AegisPay automatically captures the lower amount.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mode 2: Priority Express */}
                <div
                  onClick={() =>
                    setFormData({ ...formData, fulfillmentMode: 'PRIORITY_EXPRESS' })
                  }
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    formData.fulfillmentMode === 'PRIORITY_EXPRESS'
                      ? 'border-cyan-500/60 bg-cyan-50/50 dark:bg-cyan-950/20 shadow-xs ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#050912]/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="fulfillmentMode"
                      checked={formData.fulfillmentMode === 'PRIORITY_EXPRESS'}
                      onChange={() =>
                        setFormData({ ...formData, fulfillmentMode: 'PRIORITY_EXPRESS' })
                      }
                      className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>Priority Express (Immediate Capture)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Immediately captures funds on authorization and signals merchant fulfillment centers for same-day dispatch.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Purchasing Rules & Autonomy */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                <span>Agent Purchasing Rules</span>
              </label>

              <div className="space-y-2">
                {/* Rule 1: Always Confirm */}
                <div
                  onClick={() =>
                    setFormData({ ...formData, purchasingRule: 'ALWAYS_CONFIRM' })
                  }
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    formData.purchasingRule === 'ALWAYS_CONFIRM'
                      ? 'border-cyan-500/60 bg-cyan-50/50 dark:bg-cyan-950/20 shadow-xs ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#050912]/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="purchasingRule"
                      checked={formData.purchasingRule === 'ALWAYS_CONFIRM'}
                      onChange={() =>
                        setFormData({ ...formData, purchasingRule: 'ALWAYS_CONFIRM' })
                      }
                      className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Always ask me to confirm before buying
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Requires 1-click confirmation in chat before any PayPal authorization hold is placed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rule 2: Auto-Buy Below Threshold */}
                <div
                  onClick={() =>
                    setFormData({ ...formData, purchasingRule: 'AUTO_BUY_BELOW_THRESHOLD' })
                  }
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    formData.purchasingRule === 'AUTO_BUY_BELOW_THRESHOLD'
                      ? 'border-cyan-500/60 bg-cyan-50/50 dark:bg-cyan-950/20 shadow-xs ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#050912]/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="purchasingRule"
                      checked={formData.purchasingRule === 'AUTO_BUY_BELOW_THRESHOLD'}
                      onChange={() =>
                        setFormData({ ...formData, purchasingRule: 'AUTO_BUY_BELOW_THRESHOLD' })
                      }
                      className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                    />
                    <div className="w-full">
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
                        <span>Autonomous 1-Click Buy for Orders Under Limit</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                          {formatCents(formData.autoBuyThresholdCents)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Automatically executes purchase holds using your pre-authorized Vault v3 token for baskets under this amount.
                      </p>

                      {formData.purchasingRule === 'AUTO_BUY_BELOW_THRESHOLD' && (
                        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                            <span>$25.00</span>
                            <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                              Threshold: {formatCents(formData.autoBuyThresholdCents)}
                            </span>
                            <span>{formatCents(maxBudgetCents)}</span>
                          </div>
                          <input
                            type="range"
                            min="2500"
                            max={maxBudgetCents}
                            step="2500"
                            value={formData.autoBuyThresholdCents}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                autoBuyThresholdCents: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Single-Merchant Exposure Cap */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Single-Merchant Exposure Cap</span>
                </label>
                <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                  {formatCents(formData.singleMerchantExposureCapCents)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {showTechnicalDetails
                  ? 'Guarded by Redis Lua script: prevents an agent from allocating more than this ceiling to any single vendor domain.'
                  : 'Safety protection: prevents an agent from spending more than this maximum with any single store.'}
              </p>

              <div className="space-y-1">
                <input
                  type="range"
                  min="5000"
                  max={maxBudgetCents}
                  step="5000"
                  value={formData.singleMerchantExposureCapCents}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      singleMerchantExposureCapCents: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>$50.00</span>
                  <span>Max: {formatCents(maxBudgetCents)}</span>
                </div>
              </div>
            </div>

            {/* Section 4b: Authorized Categories & Merchant Whitelist */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Authorized Categories & Whitelist</span>
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                  Policy Enforced
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Configure which product categories and merchant domains your autonomous shopping assistant is permitted to purchase from.
              </p>

              {/* Allowed Categories Chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Allowed Categories:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          allowedCategories: AVAILABLE_CATEGORIES.map((c) => c.id),
                        })
                      }
                      className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                    <span className="text-slate-400">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          allowedCategories: [],
                        })
                      }
                      className="text-[11px] text-slate-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_CATEGORIES.map((cat) => {
                    const isSelected = (formData.allowedCategories || []).includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          const current = formData.allowedCategories || [];
                          const updated = isSelected
                            ? current.filter((c) => c !== cat.id)
                            : [...current, cat.id];
                          setFormData({ ...formData, allowedCategories: updated });
                        }}
                        className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-500/40 text-indigo-900 dark:text-indigo-200 shadow-xs'
                            : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <span className="text-sm shrink-0">{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Merchants Whitelist */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Allowed Stores Whitelist:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setWhitelistMode((prev) => !prev)}
                    className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    {whitelistMode ? 'Switch to All Stores' : 'Enable Whitelist Only'}
                  </button>
                </div>

                {whitelistMode && (
                  <div className="space-y-2 animate-fade-in">
                    {/* Selected merchant chips */}
                    <div className="flex flex-wrap gap-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 min-h-[38px] items-center">
                      {(formData.allowedMerchants || []).length === 0 ? (
                        <span className="text-[11px] text-rose-500 italic">No stores allowed. Please add a store.</span>
                      ) : (
                        (formData.allowedMerchants || []).map((dom) => (
                          <span
                            key={dom}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono bg-indigo-100/70 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                          >
                            <span>{dom}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (formData.allowedMerchants || []).filter((d) => d !== dom);
                                setFormData({ ...formData, allowedMerchants: updated });
                              }}
                              className="hover:text-rose-500 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Search box for stores */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={merchantSearchQuery}
                        onChange={(e) => setMerchantSearchQuery(e.target.value)}
                        placeholder="Search stores from Channel3 (e.g. Best Buy, Amazon...)"
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Available merchant options */}
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {availableMerchants.slice(0, 8).map((m) => {
                        const isAllowed = (formData.allowedMerchants || []).includes(m.domain);
                        return (
                          <div
                            key={m.domain}
                            className="flex items-center justify-between p-1.5 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 text-[11px]"
                          >
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name} ({m.domain})</span>
                            <button
                              type="button"
                              onClick={() => {
                                const current = formData.allowedMerchants || [];
                                const updated = isAllowed
                                  ? current.filter((d) => d !== m.domain)
                                  : [...current, m.domain];
                                setFormData({ ...formData, allowedMerchants: updated });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                isAllowed
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {isAllowed ? 'Remove' : '+ Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 5: Advanced / Developer AI Controls (BYOK & Model Override) */}
            {!isProduction && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Developer & Judge Mode
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Override agent model & supply personal user-scoped key (BYOK)
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.developerModeEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          developerModeEnabled: checked,
                          aiModel: checked
                            ? formData.aiModel || 'google/gemini-3.5-flash-lite'
                            : '',
                        });
                        setShowTechnicalDetails(checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {!formData.developerModeEnabled ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                    <span>
                      Standard shoppers automatically use the platform deployment model (<code className="text-cyan-600 dark:text-cyan-400 font-mono">Gemini 3.5 Flash Lite</code>). Toggle on to select Gemma or supply custom personal API keys (BYOK).
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4 pt-1 animate-fade-in">
                    {/* User-Scoped Isolation Callout */}
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        <span>User-Scoped Isolation & Key Verification</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                        Default Google Gemini & Gemma use the pre-configured platform key. All other providers (Claude, GPT-4o) require personal API keys that are verified with the provider upon saving.
                      </p>
                    </div>

                    {/* Model Selection */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-amber-500" />
                          <span>Select LLM Reasoning Engine</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                          {formData.aiModel ? formData.aiModel.split('/')[1] || formData.aiModel : 'Default'}
                        </span>
                      </label>

                      <div className="space-y-2">
                        {COMMERCE_MODELS.map((m) => {
                          const isSelected = (formData.aiModel || 'google/gemini-3.5-flash-lite') === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                setFormData({ ...formData, aiModel: m.id });
                                setVerificationError(null);
                              }}
                              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-1 ring-amber-500/40 shadow-xs'
                                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-[#050912]/40'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      isSelected
                                        ? 'bg-amber-500 ring-4 ring-amber-500/20'
                                        : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  />
                                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                                    {m.name}
                                  </span>
                                </div>
                                <span
                                  className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                    m.requiresKey
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                      : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  {m.requiresKey ? '🔑 BYOK Key Required' : '⚡ Platform Managed'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 pl-4">
                                {m.desc}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* User-Scoped API Key (BYOK) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-amber-500" />
                          <span>Personal API Key (BYOK)</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {COMMERCE_MODELS.find((m) => m.id === (formData.aiModel || 'google/gemini-3.5-flash-lite'))?.requiresKey
                            ? 'Required for selected model'
                            : 'Optional for Gemini/Gemma'}
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={formData.userApiKey || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, userApiKey: e.target.value });
                            setVerificationError(null);
                          }}
                          placeholder="sk-... or AIzaSy..."
                          className="w-full px-3 py-2 pr-9 bg-slate-50 dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showApiKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {COMMERCE_MODELS.find((m) => m.id === (formData.aiModel || 'google/gemini-3.5-flash-lite'))?.requiresKey
                          ? 'This model requires a valid personal API key. Keys are actively verified with the provider upon saving and never shared.'
                          : 'Gemini and Gemma models run out-of-the-box using the platform Google API key. You may optionally supply your own key.'}
                      </p>
                    </div>

                    {/* Verification Error Alert */}
                    {verificationError && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-fade-in shadow-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="font-bold block">Key Verification Failed</span>
                          <p className="text-[11px] leading-relaxed opacity-95">{verificationError}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50/60 dark:bg-[#050912]/60 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isVerifying}
              className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isVerifying}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="settings-form"
                disabled={isVerifying}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    <span>Verifying Key...</span>
                  </>
                ) : savedSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
