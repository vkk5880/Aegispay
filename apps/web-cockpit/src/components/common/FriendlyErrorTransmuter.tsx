'use client';

import React from 'react';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  Coins,
  RefreshCw,
  Search,
  PlusCircle,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface TransmutedResolutionAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  icon?: React.ComponentType<{ className?: string }>;
  payload?: any;
}

export interface TransmutedError {
  rawCode: string;
  category: 'BUDGET_OVERAGE' | 'MANDATE_EXPIRED' | 'MERCHANT_CAP' | 'ANOMALY_RISK' | 'UNAUTHORIZED_CATEGORY' | 'PAYPAL_API' | 'UNKNOWN';
  title: string;
  friendlyMessage: string;
  badge: {
    label: string;
    variant: 'amber' | 'rose' | 'indigo' | 'violet' | 'slate';
  };
  details?: string;
  overageCents?: number;
  capCents?: number;
  actions: TransmutedResolutionAction[];
}

export interface FriendlyErrorTransmuterProps {
  error: string | Error | any | null;
  onAction?: (actionId: string, actionPayload?: any) => void;
  onDismiss?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Transmutes cryptic Redis Lua enforcer error codes and PayPal API errors
 * into structured, empathetic, user-friendly recovery instructions with 1-click resolution buttons.
 */
export function transmuteError(rawInput: string | Error | any): TransmutedError {
  const errString = typeof rawInput === 'string'
    ? rawInput
    : rawInput?.message || rawInput?.error_code || rawInput?.error || JSON.stringify(rawInput || '');

  // 1. Budget hard limit overage (ERR_EXCEEDS_TOTAL_MANDATE_BUDGET)
  if (errString.includes('ERR_EXCEEDS_TOTAL_MANDATE_BUDGET')) {
    return {
      rawCode: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
      category: 'BUDGET_OVERAGE',
      title: 'Preset Spend Mandate Cap Exceeded',
      friendlyMessage:
        'Adding this purchase exceeds your session spend budget. You can quickly bump your mandate cap or let your agent find a matching cheaper alternative.',
      badge: { label: 'Budget Cap Protection', variant: 'amber' },
      details: 'Redis Lua Atomic Enforcer blocked this operation to protect your account against overspend.',
      actions: [
        {
          id: 'INCREASE_CAP',
          label: 'Increase Mandate Cap',
          variant: 'primary',
          icon: PlusCircle,
          payload: { suggestedIncreaseCents: 2000 },
        },
        {
          id: 'FIND_CHEAPER_ALTERNATIVE',
          label: 'Find Cheaper Alternative',
          variant: 'secondary',
          icon: Search,
        },
      ],
    };
  }

  // 2. Mandate expired (ERR_MANDATE_EXPIRED or ERR_MANDATE_STATUS_EXPIRED)
  if (errString.includes('ERR_MANDATE_EXPIRED') || errString.includes('ERR_MANDATE_STATUS_EXPIRED')) {
    return {
      rawCode: 'ERR_MANDATE_EXPIRED',
      category: 'MANDATE_EXPIRED',
      title: 'Session Spend Mandate Expired',
      friendlyMessage:
        'Your cryptographic session authorization window has ended. Renew your Ed25519 session with one click to continue shopping safely.',
      badge: { label: 'Session Security', variant: 'rose' },
      details: 'Mandates automatically expire to maintain strict zero-trust autonomous agent boundaries.',
      actions: [
        {
          id: 'RENEW_MANDATE',
          label: 'Renew Mandate (+24h)',
          variant: 'primary',
          icon: RefreshCw,
          payload: { durationHours: 24 },
        },
        {
          id: 'REVOKE_MANDATE',
          label: 'Close Session',
          variant: 'outline',
          icon: XCircle,
        },
      ],
    };
  }

  // 3. Single merchant exposure cap exceeded (ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP)
  if (errString.includes('ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP')) {
    return {
      rawCode: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP',
      category: 'MERCHANT_CAP',
      title: 'Single-Merchant Spend Cap Reached',
      friendlyMessage:
        'Your mandate limits exposure to any single vendor. You can approve a one-time vendor cap increase or split the cart across other merchants.',
      badge: { label: 'Vendor Risk Shield', variant: 'amber' },
      details: 'Protects buyer liquidity from over-concentrating in a single merchant domain.',
      actions: [
        {
          id: 'RAISE_MERCHANT_CAP',
          label: 'Raise Merchant Cap',
          variant: 'primary',
          icon: ShieldCheck,
          payload: { raiseCents: 5000 },
        },
        {
          id: 'SPLIT_CART',
          label: 'Re-optimize via Knapsack',
          variant: 'secondary',
          icon: Search,
        },
      ],
    };
  }

  // 4. Merchant anomaly or risk score exceeded (ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED)
  if (errString.includes('ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED') || errString.includes('ANOMALY_SCORE_HIGH')) {
    return {
      rawCode: 'ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED',
      category: 'ANOMALY_RISK',
      title: 'Merchant Anomaly Shield Alert',
      friendlyMessage:
        'Our pre-clearance gate flagged abnormal price fluctuations or fulfillment variance for this seller. We suggest switching to an audited vendor.',
      badge: { label: 'Forensic Guard', variant: 'rose' },
      details: 'Channel3 anomaly detection scored this seller above the safe threshold (> 300 bps).',
      actions: [
        {
          id: 'SWITCH_MERCHANT',
          label: 'Switch to Audited Merchant',
          variant: 'primary',
          icon: Search,
        },
        {
          id: 'BYPASS_WARNING',
          label: 'Proceed at Own Risk',
          variant: 'danger',
          icon: AlertTriangle,
        },
      ],
    };
  }

  // 5. Unauthorized category (ERR_CATEGORY_NOT_AUTHORIZED)
  if (errString.includes('ERR_CATEGORY_NOT_AUTHORIZED')) {
    const catMatch = errString.match(/ERR_CATEGORY_NOT_AUTHORIZED:?([^\s,"]+)?/);
    const cat = catMatch ? catMatch[1] : 'selected';
    return {
      rawCode: 'ERR_CATEGORY_NOT_AUTHORIZED',
      category: 'UNAUTHORIZED_CATEGORY',
      title: 'Category Not In Allowed Mandate Scope',
      friendlyMessage: `This item belongs to "${cat}", which is outside your currently active Ed25519 mandate permissions.`,
      badge: { label: 'Policy Enforcer', variant: 'indigo' },
      actions: [
        {
          id: 'AUTHORIZE_CATEGORY',
          label: `Authorize "${cat}" Category`,
          variant: 'primary',
          icon: PlusCircle,
          payload: { category: cat },
        },
      ],
    };
  }

  // 6. PayPal API errors (PAYER_ACTION_REQUIRED, INSTRUMENT_DECLINED, etc.)
  if (
    errString.includes('PAYER_ACTION_REQUIRED') ||
    errString.includes('INSTRUMENT_DECLINED') ||
    errString.includes('AUTHORIZATION_AMOUNT_EXCEEDED') ||
    errString.includes('PAYPAL')
  ) {
    return {
      rawCode: 'PAYPAL_API_ERROR',
      category: 'PAYPAL_API',
      title: 'PayPal Payment Authorization Notice',
      friendlyMessage:
        'PayPal payment verification requested an updated payment method or authentication check. Zero funds were captured.',
      badge: { label: 'PayPal Vault Gateway', variant: 'violet' },
      details: errString.length < 180 ? errString : 'PayPal API returned an authorization verification code.',
      actions: [
        {
          id: 'RETRY_PAYPAL_VAULT',
          label: 'Retry Vault Setup Token',
          variant: 'primary',
          icon: RefreshCw,
        },
        {
          id: 'CHANGE_PAYPAL_FUNDING',
          label: 'Update PayPal Funding Source',
          variant: 'secondary',
          icon: Coins,
        },
      ],
    };
  }

  // 7. Fallback / generic error transmutation
  return {
    rawCode: errString.slice(0, 48) || 'SYSTEM_FAULT',
    category: 'UNKNOWN',
    title: 'Autonomous Flow Interruption',
    friendlyMessage:
      'The clearinghouse intercepted an unexpected response. Your funds remain secured in escrow holds with zero unapproved charges.',
    badge: { label: 'Clearinghouse Safe Gate', variant: 'slate' },
    details: errString.slice(0, 160),
    actions: [
      {
        id: 'RETRY_OPERATION',
        label: 'Retry Step',
        variant: 'primary',
        icon: RefreshCw,
      },
      {
        id: 'CONTACT_SUPPORT',
        label: 'View Forensic Log',
        variant: 'outline',
        icon: HelpCircle,
      },
    ],
  };
}

export function FriendlyErrorTransmuter({
  error,
  onAction,
  onDismiss,
  className = '',
  compact = false,
}: FriendlyErrorTransmuterProps) {
  if (!error) return null;

  const transmuted = transmuteError(error);

  const badgeStyles = {
    amber: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40',
    rose: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
    indigo: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/40',
    violet: 'bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-500/40',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  }[transmuted.badge.variant];

  const borderStyles = {
    BUDGET_OVERAGE: 'border-amber-400/80 dark:border-amber-500/40 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 dark:from-[#131109] dark:via-[#0c101a] dark:to-[#0f172a]',
    MANDATE_EXPIRED: 'border-rose-400/80 dark:border-rose-500/40 bg-gradient-to-br from-rose-50/90 via-white to-rose-50/40 dark:from-[#180a0e] dark:via-[#0c101a] dark:to-[#0f172a]',
    MERCHANT_CAP: 'border-amber-400/80 dark:border-amber-500/40 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 dark:from-[#131109] dark:via-[#0c101a] dark:to-[#0f172a]',
    ANOMALY_RISK: 'border-rose-400/80 dark:border-rose-500/40 bg-gradient-to-br from-rose-50/90 via-white to-rose-50/40 dark:from-[#180a0e] dark:via-[#0c101a] dark:to-[#0f172a]',
    UNAUTHORIZED_CATEGORY: 'border-indigo-400/80 dark:border-indigo-500/40 bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 dark:from-[#0d1024] dark:via-[#0c101a] dark:to-[#0f172a]',
    PAYPAL_API: 'border-violet-400/80 dark:border-violet-500/40 bg-gradient-to-br from-violet-50/90 via-white to-violet-50/40 dark:from-[#130d24] dark:via-[#0c101a] dark:to-[#0f172a]',
    UNKNOWN: 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0c101a]',
  }[transmuted.category];

  return (
    <div
      className={`relative rounded-2xl border p-5 shadow-lg backdrop-blur-md transition-all ${borderStyles} ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#080d1a] border border-slate-200 dark:border-slate-800 shadow-xs flex-shrink-0 mt-0.5">
            {transmuted.category === 'MANDATE_EXPIRED' ? (
              <Clock className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : transmuted.category === 'ANOMALY_RISK' ? (
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : transmuted.category === 'PAYPAL_API' ? (
              <Coins className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>

          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                {transmuted.title}
              </h3>
              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${badgeStyles}`}>
                {transmuted.badge.label}
              </span>
              <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                [{transmuted.rawCode}]
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
              {transmuted.friendlyMessage}
            </p>

            {transmuted.details && !compact && (
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono pt-1">
                Forensics: {transmuted.details}
              </p>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss error notification"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 1-Click Action Resolution Buttons */}
      {transmuted.actions.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
            <span>Recommended 1-Click Recovery:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {transmuted.actions.map((act) => {
              const Icon = act.icon;
              const buttonVariantClass = {
                primary:
                  'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs font-semibold',
                secondary:
                  'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium',
                outline:
                  'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300',
                danger:
                  'bg-rose-600 hover:bg-rose-500 text-white font-medium',
              }[act.variant || 'primary'];

              return (
                <button
                  key={act.id}
                  onClick={() => onAction && onAction(act.id, act.payload)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95 ${buttonVariantClass}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{act.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
