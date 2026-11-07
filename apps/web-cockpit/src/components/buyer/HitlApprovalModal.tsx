'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Store,
  DollarSign,
  TrendingDown,
  Sparkles,
  Zap,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface HitlPushApprovalRequest {
  id: string;
  type: 'MERCHANT_COUNTER_OFFER' | 'CAP_OVERAGE_EXCEPTION' | 'DISPUTE_ARBITRATION' | 'CUSTOM_ACTION';
  mandate_id?: string;
  title?: string;
  message: string;
  original_amount_cents?: number;
  requested_amount_cents?: number;
  delta_cents?: number;
  currency?: string;
  timeout_seconds?: number;
  merchant_domain?: string;
  counter_voucher_id?: string;
  discount_from_retail_pct?: number;
  metadata?: Record<string, any>;
}

export interface HitlApprovalModalProps {
  request: HitlPushApprovalRequest | null;
  isOpen: boolean;
  onApprove: (id: string, request: HitlPushApprovalRequest) => void;
  onDecline: (id: string, request: HitlPushApprovalRequest) => void;
  onTimeout?: (id: string, request: HitlPushApprovalRequest) => void;
}

export function HitlApprovalModal({
  request,
  isOpen,
  onApprove,
  onDecline,
  onTimeout,
}: HitlApprovalModalProps) {
  const totalSeconds = request?.timeout_seconds ?? 60;
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const onTimeoutRef = useRef(onTimeout);
  const onDeclineRef = useRef(onDecline);
  const requestRef = useRef(request);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onDeclineRef.current = onDecline;
    requestRef.current = request;
  }, [onTimeout, onDecline, request]);

  const timeoutSeconds = request?.timeout_seconds ?? 60;
  const requestId = request?.id;

  // Background scroll lock
  useEffect(() => {
    if (!isOpen || !requestId) return;

    if (typeof document !== 'undefined') {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, requestId]);

  // Focus trapping and Escape key dismiss
  useEffect(() => {
    if (!isOpen || !requestId) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (onDeclineRef.current && requestRef.current) {
            onDeclineRef.current(requestRef.current.id, requestRef.current);
          }
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );

          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      // Focus first interactive element or modal container
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const firstFocusable = modalRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            modalRef.current.focus();
          }
        }
      }, 0);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, requestId]);

  useEffect(() => {
    if (!isOpen || !requestId) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setSecondsLeft(timeoutSeconds);

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (onTimeoutRef.current && requestRef.current) {
            onTimeoutRef.current(requestRef.current.id, requestRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, requestId, timeoutSeconds]);

  if (!isOpen || !request) return null;

  const isCounterOffer = request.type === 'MERCHANT_COUNTER_OFFER';
  const isCapOverage = request.type === 'CAP_OVERAGE_EXCEPTION';

  // SVG Ring Progress Calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Dynamic Ring Color
  const ringColor =
    secondsLeft <= 10
      ? 'text-rose-500 stroke-rose-500'
      : secondsLeft <= 25
      ? 'text-amber-500 stroke-amber-500'
      : 'text-cyan-500 stroke-cyan-500';

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(request.id, request);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    try {
      await onDecline(request.id, request);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deltaDollars = request.delta_cents
    ? (request.delta_cents / 100).toFixed(2)
    : request.requested_amount_cents && request.original_amount_cents
    ? ((request.requested_amount_cents - request.original_amount_cents) / 100).toFixed(2)
    : '0.00';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#080e1b] border-2 border-cyan-400 dark:border-cyan-500/50 shadow-2xl overflow-hidden relative focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hitl-approval-title"
      >
        {/* Top Header Glow Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500" />

        <div className="p-6 sm:p-7 space-y-6">
          {/* Top Bar with Icon & Countdown Ring */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl border shadow-xs ${
                  isCapOverage
                    ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300'
                    : 'bg-cyan-100 dark:bg-cyan-950/60 border-cyan-300 dark:border-cyan-500/40 text-cyan-700 dark:text-cyan-300'
                }`}
              >
                {isCapOverage ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : (
                  <Store className="w-6 h-6" />
                )}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {request.type.replace(/_/g, ' ')}
                </span>
                <h2
                  id="hitl-approval-title"
                  className="text-lg font-black text-slate-900 dark:text-white tracking-tight mt-1"
                >
                  {request.title ||
                    (isCounterOffer
                      ? 'Merchant Counter-Offer Received'
                      : 'Mandate Cap Overage Exception')}
                </h2>
              </div>
            </div>

            {/* 60-Second Circular Countdown Ring */}
            <div className="relative flex items-center justify-center flex-shrink-0 w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 88 88">
                {/* Background Track */}
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth="6"
                  fill="transparent"
                />
                {/* Dynamic Countdown Ring */}
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  className={`${ringColor} transition-all duration-1000 ease-linear`}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                <span
                  className={`text-lg font-black ${
                    secondsLeft <= 10
                      ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {secondsLeft}s
                </span>
                <span className="text-[9px] uppercase tracking-tighter text-slate-500">left</span>
              </div>
            </div>
          </div>

          {/* Main Context Message Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#050912] border border-slate-200 dark:border-slate-800/80 space-y-3 font-sans">
            <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
              {request.message}
            </p>

            {/* Key Value Comparison Pills */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0a1120] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block text-[10px] font-sans">
                  {isCounterOffer ? 'Your Initial Bid' : 'Original Mandate Cap'}
                </span>
                <span className="text-slate-900 dark:text-slate-300 font-bold">
                  {request.original_amount_cents
                    ? formatCents(request.original_amount_cents)
                    : '$450.00'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0a1120] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block text-[10px] font-sans">
                  {isCounterOffer ? 'Merchant Counter' : 'Requested Spend'}
                </span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                  {request.requested_amount_cents
                    ? formatCents(request.requested_amount_cents)
                    : '$465.00'}
                </span>
              </div>
            </div>

            {/* Difference / Overage Indicator */}
            <div className="flex items-center justify-between text-xs px-1 text-slate-600 dark:text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Variance Delta:
              </span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                +${deltaDollars} {isCounterOffer ? 'above initial bid' : 'over cap'}
              </span>
            </div>
          </div>

          {/* Cryptographic Reassurance Guard */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              If you decline or the timer expires, zero funds are authorized or captured.
            </span>
          </div>

          {/* Action Confirmation Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleDecline}
              disabled={isSubmitting || secondsLeft === 0}
              className="py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <XCircle className="w-4 h-4" />
              <span>{isCounterOffer ? 'Decline Counter' : 'Block Spend'}</span>
            </button>

            <button
              onClick={handleApprove}
              disabled={isSubmitting || secondsLeft === 0}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCounterOffer ? 'Accept Counter' : 'Approve 1-Time'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
