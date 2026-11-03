'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Zap,
  Sliders,
  DollarSign,
  Save,
  RotateCcw,
  CheckCircle2,
  Building,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface UserSettings {
  // Delivery Address
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;

  // Fulfillment & Protection Mode
  fulfillmentMode: 'PRICE_WATCHER_72H' | 'PRIORITY_EXPRESS';

  // Purchasing Rules
  purchasingRule: 'ALWAYS_CONFIRM' | 'AUTO_BUY_BELOW_THRESHOLD';
  autoBuyThresholdCents: number;

  // Single-Merchant Exposure Cap
  singleMerchantExposureCapCents: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  streetAddress: '2211 North First Street',
  city: 'San Jose',
  state: 'CA',
  zipCode: '95131',
  fulfillmentMode: 'PRICE_WATCHER_72H',
  purchasingRule: 'ALWAYS_CONFIRM',
  autoBuyThresholdCents: 15000, // $150.00
  singleMerchantExposureCapCents: 35000, // $350.00
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
  const [formData, setFormData] = useState<UserSettings>(initialSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setFormData(initialSettings);
  }, [initialSettings, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setFormData(DEFAULT_USER_SETTINGS);
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
                <span>Buyer Procurement Settings</span>
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
                Guarded by Redis Lua script: prevents an agent from allocating more than this ceiling to any single vendor domain.
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
          </form>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50/60 dark:bg-[#050912]/60 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="settings-form"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5"
              >
                {savedSuccess ? (
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
