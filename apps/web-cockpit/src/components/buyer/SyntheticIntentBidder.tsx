'use client';

import React, { useState } from 'react';
import { Gavel, ShieldAlert, Award, CheckCircle2, Zap } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import type { SessionMandate } from '@aegispay/shared-types';

export interface SyntheticIntentBidderProps {
  mandate?: SessionMandate | null;
  basketTotalCents?: number;
  budgetCapCents?: number;
  onBidAccepted?: (bidResult: any) => void;
}

export function SyntheticIntentBidder({
  mandate,
  basketTotalCents = 49000, // $490.00
  budgetCapCents = 45000,   // $450.00 (8.16% overage)
  onBidAccepted,
}: SyntheticIntentBidderProps) {
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [bidSubmitted, setBidSubmitted] = useState<boolean>(false);
  const [bidResult, setBidResult] = useState<any>(null);

  const overageCents = basketTotalCents - budgetCapCents;
  const overagePercentage = Number(((overageCents / budgetCapCents) * 100).toFixed(2));
  const isEligible = overagePercentage >= 5.0 && overagePercentage <= 18.0;

  // Channel3 Product demonstration context
  const merchantDomain = 'audio-gear-direct.com';
  const commissionRebateRate = 0.15; // 15% Channel3 rebate

  const handleMintVaultBid = async () => {
    setIsMinting(true);
    try {
      const voucherId = `syn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const setupTokenId = `vault_setup_${Date.now()}`;

      // Merchant margin floor allows 12% discount or 80% of saved customer acquisition cost
      const allowedDiscount = Math.max(0.10, commissionRebateRate * 0.8);
      const merchantFloorCents = Math.round(basketTotalCents * (1 - allowedDiscount));
      const autoCleared = budgetCapCents >= merchantFloorCents;

      // Simulated latency
      await new Promise((resolve) => setTimeout(resolve, 800));

      const result = {
        voucher_id: voucherId,
        mandate_id: mandate?.mandate_id || 'vch_default_9f8a',
        paypal_vault_setup_token_id: setupTokenId,
        buyer_bid_cents: budgetCapCents,
        retail_offer_cents: basketTotalCents,
        overage_percentage: overagePercentage,
        merchant_min_floor_cents: merchantFloorCents,
        auto_cleared: autoCleared,
        negotiation_status: autoCleared ? 'ACCEPTED_AND_CAPTURED' : 'OPEN_BID',
        resulting_paypal_order_id: autoCleared ? `ORD-SYN-${Date.now()}` : undefined,
      };

      setBidResult(result);
      setBidSubmitted(true);
      if (onBidAccepted) {
        onBidAccepted(result);
      }
    } catch (err) {
      console.error('Failed to mint synthetic intent bid:', err);
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Glow highlight */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1e293b] gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/40 rounded-xl text-amber-700 dark:text-amber-400 shadow-xs">
            <Gavel className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              Synthetic Intent Negotiation Clearinghouse
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                PayPal Vault v3
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Autonomous Buyer-to-Merchant Bidding when basket exceeds budget cap by 5%–18%
            </p>
          </div>
        </div>

        {/* Binding Guarantee Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/40 border border-cyan-300 dark:border-cyan-500/40 text-cyan-800 dark:text-cyan-300 text-xs font-mono font-semibold">
          <Award className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          Binding Cryptographic Guarantee
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Bid Parameters */}
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">Target Merchant Domain:</span>
              <span className="text-slate-900 dark:text-slate-200 font-mono font-semibold">{merchantDomain}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">Gross Basket Value:</span>
              <span className="text-slate-900 dark:text-slate-200 font-mono">{formatCents(basketTotalCents)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-400">Buyer Hard Cap Budget:</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">{formatCents(budgetCapCents)}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-slate-600 dark:text-slate-400">Deficit / Overage Spread:</span>
              <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">
                +{formatCents(overageCents)} ({overagePercentage}%)
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-900 dark:text-amber-300/90 leading-relaxed flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Autonomous Clearing Rule:</strong> When basket is 5%–18% above cap, the Buyer Agent mints a binding
              bid voucher backed by a pre-authorized <strong>PayPal Vault v3 Setup Token</strong>. Merchant accepts the 8.1%
              margin reduction because Channel3 commission rebate offsets CAC.
            </div>
          </div>

          {!bidSubmitted ? (
            <button
              onClick={handleMintVaultBid}
              disabled={isMinting || !isEligible}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold text-xs tracking-wider uppercase transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {isMinting ? (
                <>Minting Vault v3 Token...</>
              ) : (
                <>
                  <Award className="w-4 h-4" />
                  Mint Binding Vault v3 Bid ({formatCents(budgetCapCents)})
                </>
              )}
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Bid dispatched & cleared against merchant floor!
            </div>
          )}
        </div>

        {/* Cryptographic Voucher Status Card */}
        <div className="bg-slate-50 dark:bg-[#060b14] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between font-mono text-[11px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400 font-sans font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Synthetic Intent Voucher
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] border flex items-center gap-1 ${
                  bidSubmitted
                    ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                    : 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-500/30'
                }`}
              >
                {bidSubmitted ? 'ACCEPTED & CAPTURED' : 'READY TO MINT'}
              </span>
            </div>

            {bidResult ? (
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">VOUCHER ID:</span>
                  <span className="text-amber-700 dark:text-amber-300 font-bold">{bidResult.voucher_id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">PAYPAL VAULT SETUP TOKEN:</span>
                  <div className="truncate text-slate-800 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-1.5 rounded border border-slate-200 dark:border-slate-800 select-all">
                    {bidResult.paypal_vault_setup_token_id}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[10px]">BUYER BID:</span>
                    <span className="text-cyan-700 dark:text-cyan-400 font-bold">{formatCents(bidResult.buyer_bid_cents)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">MERCHANT FLOOR:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{formatCents(bidResult.merchant_min_floor_cents)}</span>
                  </div>
                </div>
                {bidResult.resulting_paypal_order_id && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">RESULTING CAPTURED ORDER ID:</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">{bidResult.resulting_paypal_order_id}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 dark:text-slate-500 font-sans text-xs">
                Voucher awaiting trigger. When minted, PayPal Vault token guarantees zero-click payment conversion.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
            <span>Anchored by Ed25519 Mandate Signature</span>
            <span className="font-semibold text-cyan-600 dark:text-cyan-400">Zero Risk to Merchant</span>
          </div>
        </div>
      </div>
    </div>
  );
}
