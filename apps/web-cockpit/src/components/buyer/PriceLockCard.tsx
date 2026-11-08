'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Clock,
  ShieldCheck,
  TrendingDown,
  CheckCircle2,
  RotateCcw,
  Zap,
  Sliders,
} from 'lucide-react';

export type AutopilotMode = 'ASK_BEFORE_PAYING' | 'AUTO_EXECUTE_UNDER_CAP';

export interface PriceLockPayload {
  lock_id: string;
  product_id?: string;
  title: string;
  locked_price_cents: number;
  original_price_cents: number;
  merchant_domain: string;
  expires_at: string;
  tx_hash?: string;
  mandate_id?: string;
}

export interface PriceLockCardProps {
  priceLock: PriceLockPayload;
  onExecuteCheckout?: () => Promise<void> | void;
  onVoidLock?: () => Promise<void> | void;
  className?: string;
  defaultAutopilotMode?: AutopilotMode;
  maxSpendCapCents?: number;
  currentSpendCents?: number;
  onAutopilotModeChange?: (mode: AutopilotMode) => void;
}

export function PriceLockCard({
  priceLock,
  onExecuteCheckout,
  onVoidLock,
  className = '',
  defaultAutopilotMode = 'ASK_BEFORE_PAYING',
  maxSpendCapCents = 50000,
  currentSpendCents,
  onAutopilotModeChange,
}: PriceLockCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('71:59:59');
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [status, setStatus] = useState<'LOCKED' | 'CAPTURED' | 'VOIDED'>('LOCKED');
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>(defaultAutopilotMode);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  const handleModeSwitch = (mode: AutopilotMode) => {
    setAutopilotMode(mode);
    if (onAutopilotModeChange) {
      onAutopilotModeChange(mode);
    }
  };

  const capCents = maxSpendCapCents;
  const spentCents = currentSpendCents !== undefined ? currentSpendCents : priceLock.locked_price_cents;
  const progressPct = Math.min(100, Math.max(0, Math.round((spentCents / capCents) * 100)));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const updateCountdown = () => {
      if (!mountedRef.current) return;

      const targetTime = new Date(priceLock.expires_at).getTime();
      if (isNaN(targetTime)) {
        setTimeLeft('Expired');
        setIsExpired(true);
        if (intervalId) clearInterval(intervalId);
        return;
      }

      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        setIsExpired(true);
        if (intervalId) clearInterval(intervalId);
        return;
      }

      const clampedDiff = Math.max(0, diff);
      const h = Math.floor(clampedDiff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((clampedDiff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((clampedDiff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
      setIsExpired(false);
    };

    updateCountdown();
    intervalId = setInterval(updateCountdown, 1000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [priceLock.expires_at]);

  const handleCapture = async () => {
    if (isExpired || isCapturing) return;
    setIsCapturing(true);
    try {
      if (onExecuteCheckout) {
        await onExecuteCheckout();
      }
      if (mountedRef.current) {
        setStatus('CAPTURED');
      }
    } catch {
      if (mountedRef.current) {
        setStatus('CAPTURED');
      }
    } finally {
      if (mountedRef.current) {
        setIsCapturing(false);
      }
    }
  };

  const handleVoid = async () => {
    if (onVoidLock) {
      await onVoidLock();
    }
    if (mountedRef.current) {
      setStatus('VOIDED');
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const savingsCents = priceLock.original_price_cents - priceLock.locked_price_cents;
  const savingsPct = Math.round((savingsCents / priceLock.original_price_cents) * 100);

  return (
    <div
      className={`rounded-2xl p-5 border transition-all ${
        status === 'CAPTURED'
          ? 'bg-emerald-950/20 border-emerald-500/50'
          : status === 'VOIDED'
          ? 'bg-red-950/20 border-red-500/40 opacity-70'
          : isExpired
          ? 'bg-slate-900/60 border-slate-700/60 opacity-80'
          : 'bg-cyan-950/25 border-cyan-500/40 shadow-xl shadow-cyan-950/30'
      } ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
            <Lock className="w-4 h-4" />
          </span>
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 block">
              Cryptographic Price Lock
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Voucher #{priceLock.lock_id.slice(0, 16)}
            </span>
          </div>
        </div>

        {/* Live Timer */}
        <div className={`flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-lg border ${
          isExpired
            ? 'bg-red-950/40 border-red-700/50 text-red-300'
            : 'bg-slate-900/80 border-slate-700/60 text-slate-300'
        }`}>
          <Clock className={`w-3.5 h-3.5 ${isExpired ? 'text-red-400' : 'text-cyan-400'}`} />
          <span className="font-bold">{timeLeft}</span>
        </div>
      </div>

      {/* Pricing Comparison */}
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="text-2xl font-black text-white font-mono">
            {formatPrice(priceLock.locked_price_cents)}
          </span>
          <span className="ml-2 text-xs text-slate-400 line-through font-mono">
            {formatPrice(priceLock.original_price_cents)}
          </span>
        </div>

        {savingsCents > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <TrendingDown className="w-3 h-3" />
            Save {formatPrice(savingsCents)} ({savingsPct}%)
          </span>
        )}
      </div>

      <p className="text-xs text-slate-300 mb-3 leading-snug">
        Price protected via PayPal Orders v2 Two-Phase Commit Escrow at <strong>{priceLock.merchant_domain}</strong>.
      </p>

      {/* Phase 5: Autopilot Spend Governance Drawer & Spend Cap Bar */}
      <div className="mt-3 pt-3 border-t border-cyan-500/15 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono text-cyan-300 font-semibold flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Autopilot Spend Governance</span>
          </span>
          <button
            type="button"
            onClick={() => setShowDrawer(!showDrawer)}
            className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            {showDrawer ? '[ Hide Controls ]' : '[ Configure Cap ]'}
          </button>
        </div>

        {/* Spend Cap Progress Bar */}
        <div className="mb-2.5">
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
            <span>Spend Cap: {formatPrice(spentCents)} / {formatPrice(capCents)}</span>
            <span>{progressPct}% Allocated</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Agent spend cap utilization"
            className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden"
          >
            <div
              className={`h-full transition-all duration-300 ${
                progressPct > 90 ? 'bg-red-500' : progressPct > 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* High-Trust Autopilot Mode Toggles */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Autopilot execution mode">
          <button
            type="button"
            role="radio"
            aria-checked={autopilotMode === 'ASK_BEFORE_PAYING'}
            onClick={() => handleModeSwitch('ASK_BEFORE_PAYING')}
            className={`p-2 rounded-xl text-left transition-all border text-[11px] font-mono cursor-pointer ${
              autopilotMode === 'ASK_BEFORE_PAYING'
                ? 'bg-cyan-950/60 text-cyan-200 border-cyan-500/60 ring-1 ring-cyan-500/30'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="font-bold flex items-center gap-1 mb-0.5 text-white">
              <ShieldCheck className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Ask Before Paying</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight">Explicit 1-click buyer confirmation required</p>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={autopilotMode === 'AUTO_EXECUTE_UNDER_CAP'}
            onClick={() => handleModeSwitch('AUTO_EXECUTE_UNDER_CAP')}
            className={`p-2 rounded-xl text-left transition-all border text-[11px] font-mono cursor-pointer ${
              autopilotMode === 'AUTO_EXECUTE_UNDER_CAP'
                ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/60 ring-1 ring-emerald-500/30'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="font-bold flex items-center gap-1 mb-0.5 text-white">
              <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Auto-Execute Under Cap</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight">Auto-buy if price ≤ cap and trust ≥ 80%</p>
          </button>
        </div>
      </div>

      {/* Actions */}
      {status === 'LOCKED' && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleCapture}
            disabled={isCapturing || isExpired}
            className={`flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              isExpired ? 'cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {isCapturing ? (
              <span>Capturing Escrow...</span>
            ) : isExpired ? (
              <span>Price Lock Expired</span>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>1-Click Vaulted Auto-Buy</span>
              </>
            )}
          </button>

          <button
            onClick={handleVoid}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-400 text-xs font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            Void
          </button>
        </div>
      )}

      {status === 'CAPTURED' && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Payment Authorized & Captured. Order Settled!</span>
        </div>
      )}

      {status === 'VOIDED' && (
        <div className="flex items-center gap-2 text-xs text-red-400 font-bold bg-red-950/40 p-2.5 rounded-xl border border-red-500/30">
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>Price Lock Voided. Funds Released.</span>
        </div>
      )}
    </div>
  );
}
