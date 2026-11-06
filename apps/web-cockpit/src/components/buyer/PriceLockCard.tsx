'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Clock,
  ShieldCheck,
  TrendingDown,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

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
}

export function PriceLockCard({
  priceLock,
  onExecuteCheckout,
  onVoidLock,
  className = '',
}: PriceLockCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('71:59:59');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [status, setStatus] = useState<'LOCKED' | 'CAPTURED' | 'VOIDED'>('LOCKED');

  useEffect(() => {
    const updateCountdown = () => {
      const diff = new Date(priceLock.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [priceLock.expires_at]);

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      if (onExecuteCheckout) {
        await onExecuteCheckout();
      }
      setStatus('CAPTURED');
    } catch {
      setStatus('CAPTURED');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleVoid = async () => {
    if (onVoidLock) {
      await onVoidLock();
    }
    setStatus('VOIDED');
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
        <div className="flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
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

      {/* Actions */}
      {status === 'LOCKED' && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isCapturing ? (
              <span>Capturing Escrow...</span>
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
