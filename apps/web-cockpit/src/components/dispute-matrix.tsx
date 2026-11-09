'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileCheck,
  Clock,
  Layers,
  Camera,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  DollarSign,
  ArrowUpRight,
  FileText,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { FriendlyErrorTransmuter } from './common/FriendlyErrorTransmuter';

export interface DisputeEvidenceData {
  // camelCase properties
  disputeId?: string;
  amountCents?: number;
  reason?: string;
  stage?: 'INQUIRY' | 'CLAIM' | 'CHARGEBACK' | 'PRE_ARBITRATION' | 'ARBITRATION';
  defectBoundingBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number };
  exifSoftware?: string;
  exifTamperFlag?: boolean;
  liabilityScoreL?: number;
  abuseRiskScoreR?: number;
  tierAction?: 'TIER1_REFUND' | 'TIER2_PARTIAL_OFFER' | 'TIER3_RETURN_OFFER' | 'TIER4_CONTEST_PDF' | 'TIER5_SLA_ESCALATE' | string;
  partialOfferCents?: number;
  trackingNumber?: string;
  carrierStatus?: string;
  slaHoursRemaining?: number;
  buyerStatement?: string;
  buyerImageUrl?: string;

  // snake_case interoperability properties
  dispute_id?: string;
  dispute_amount_cents?: number;
  defect_bounding_box?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number };
  exif_software?: string;
  exif_tampered?: boolean;
  exif_tamper_flag?: boolean;
  liability_score_l?: number;
  abuse_risk_score_r?: number;
  selected_tier_action?: string;
  tier_action?: string;
  partial_offer_cents?: number;
  tracking_number?: string;
  carrier_status?: string;
  sla_hours_remaining?: number;
  buyer_statement?: string;
  buyer_image_url?: string;
  tamper_reasons?: string[];
}

export function DisputeMatrixViewer({
  evidence,
  onTriggerAction,
  submitting = false,
}: {
  evidence?: DisputeEvidenceData;
  onTriggerAction?: (actionRel: string) => void | Promise<void>;
  submitting?: boolean;
}) {
  const [internalSubmittingAction, setInternalSubmittingAction] = useState<string | null>(null);
  const [lastExecutedAction, setLastExecutedAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSubmitting = submitting || internalSubmittingAction !== null;

  // Dual casing normalization
  const disputeId = evidence?.disputeId || evidence?.dispute_id || 'PP-D-849201';
  const amountCents = Math.max(0, Number(evidence?.amountCents ?? evidence?.dispute_amount_cents ?? 14900) || 0);
  const reason = evidence?.reason || 'ITEM_NOT_AS_DESCRIBED';
  const stage = (evidence?.stage || 'INQUIRY') as string;
  const buyerStatement = evidence?.buyerStatement || evidence?.buyer_statement || 'Item arrived with cracked display screen and broken hinge.';
  const buyerImageUrl = evidence?.buyerImageUrl || evidence?.buyer_image_url || '';

  const exifTamperFlag = Boolean(
    evidence?.exifTamperFlag ??
    evidence?.exif_tamper_flag ??
    evidence?.exif_tampered ??
    true
  );

  const exifSoftware = evidence?.exifSoftware || evidence?.exif_software || (exifTamperFlag ? 'Adobe Photoshop 2026' : 'Camera Raw (Untampered)');
  const trackingNumber = evidence?.trackingNumber || evidence?.tracking_number || '1Z9999999999999999';
  const carrierStatus = evidence?.carrierStatus || evidence?.carrier_status || 'DELIVERED_FRONT_DOOR';

  const tierActionKey = (
    evidence?.tierAction ||
    evidence?.tier_action ||
    evidence?.selected_tier_action ||
    'TIER4_CONTEST_PDF'
  ) as string;

  const partialOfferCents = evidence?.partialOfferCents ?? evidence?.partial_offer_cents ?? Math.round(amountCents * 0.5);
  const slaRemaining = Math.max(0, Number(evidence?.slaHoursRemaining ?? evidence?.sla_hours_remaining ?? 18) || 0);

  const rawLiability = evidence?.liabilityScoreL ?? evidence?.liability_score_l ?? 0.15;
  const liabilityScoreL = Math.max(0, Math.min(1, Number(rawLiability) || 0));

  const rawAbuse = evidence?.abuseRiskScoreR ?? evidence?.abuse_risk_score_r ?? 0.72;
  const abuseRiskScoreR = Math.max(0, Math.min(1, Number(rawAbuse) || 0));

  // Safeguard coordinates [ymin, xmin, ymax, xmax] clamped within [0, 1]
  const rawBox = evidence?.defectBoundingBox ?? evidence?.defect_bounding_box ?? [0.35, 0.4, 0.55, 0.65];
  let normalizedBox: [number, number, number, number] | null = null;

  if (Array.isArray(rawBox) && rawBox.length === 4) {
    normalizedBox = [
      Math.max(0, Math.min(1, Number(rawBox[0]) || 0)),
      Math.max(0, Math.min(1, Number(rawBox[1]) || 0)),
      Math.max(0, Math.min(1, Number(rawBox[2]) || 0)),
      Math.max(0, Math.min(1, Number(rawBox[3]) || 0)),
    ];
  } else if (rawBox && typeof rawBox === 'object') {
    const objBox = rawBox as { ymin?: number; xmin?: number; ymax?: number; xmax?: number };
    normalizedBox = [
      Math.max(0, Math.min(1, Number(objBox.ymin) || 0)),
      Math.max(0, Math.min(1, Number(objBox.xmin) || 0)),
      Math.max(0, Math.min(1, Number(objBox.ymax) || 0)),
      Math.max(0, Math.min(1, Number(objBox.xmax) || 0)),
    ];
  }

  const ymin = normalizedBox ? Math.min(normalizedBox[0], normalizedBox[2]) : 0;
  const xmin = normalizedBox ? Math.min(normalizedBox[1], normalizedBox[3]) : 0;
  const ymax = normalizedBox ? Math.max(normalizedBox[0], normalizedBox[2]) : 0;
  const xmax = normalizedBox ? Math.max(normalizedBox[1], normalizedBox[3]) : 0;
  const boxHeight = (ymax - ymin) * 100;
  const boxWidth = (xmax - xmin) * 100;
  const defectPercent = Math.round((ymax - ymin) * (xmax - xmin) * 100);

  const tierColors: Record<string, string> = {
    TIER1_REFUND: 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40',
    TIER2_PARTIAL_OFFER: 'bg-indigo-950/60 text-indigo-400 border-indigo-500/40',
    TIER3_RETURN_OFFER: 'bg-blue-950/60 text-blue-400 border-blue-500/40',
    TIER4_CONTEST_PDF: 'bg-rose-950/60 text-rose-400 border-rose-500/40',
    TIER5_SLA_ESCALATE: 'bg-amber-950/60 text-amber-400 border-amber-500/40',
  };
  const activeBadgeColor = tierColors[tierActionKey] || 'bg-slate-800 text-slate-300 border-slate-700';

  const handleAction = async (actionRel: string) => {
    if (isSubmitting) return;
    setInternalSubmittingAction(actionRel);
    setActionError(null);
    try {
      if (onTriggerAction) {
        await onTriggerAction(actionRel);
      }
      setLastExecutedAction(actionRel);
    } catch (err: any) {
      setActionError(err.message || `Failed to execute action ${actionRel}`);
    } finally {
      setInternalSubmittingAction(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0c1424] p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
              Dispute Forensics Matrix
              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${activeBadgeColor}`}>
                {tierActionKey}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Dispute ID: <span className="font-mono text-slate-300">{disputeId}</span> • Stage: <span className="text-white font-mono">{stage}</span> • Amount: {formatCents(amountCents)}
            </p>
          </div>
        </div>

        {/* SLA Countdown Timer */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#060b14] border border-slate-800 text-xs font-mono self-start sm:self-auto">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">SLA Due Date:</span>
          <span className={`font-bold ${slaRemaining <= 20 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
            {slaRemaining}h remaining
          </span>
        </div>
      </div>

      {actionError && (
        <FriendlyErrorTransmuter error={actionError} onDismiss={() => setActionError(null)} />
      )}

      {/* Grid View: Vision Forensics + (L, R) Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Defect Bounding Box Viewer */}
        <div className="rounded-xl border border-slate-800 bg-[#060b14] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              Evidence Visual Analysis
            </span>
            {exifTamperFlag ? (
              <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 rounded font-bold">
                EXIF TAMPER DETECTED
              </span>
            ) : (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                EXIF AUTHENTICATED
              </span>
            )}
          </div>

          <div className="relative aspect-video rounded-lg bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center">
            {buyerImageUrl ? (
              <img
                src={buyerImageUrl}
                alt={`Disputed evidence for ${disputeId}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center text-slate-600 text-xs font-mono">
                [Buyer Uploaded Evidence]
              </div>
            )}

            {normalizedBox && boxHeight > 0 && boxWidth > 0 && (
              <div
                className="absolute border-2 border-rose-500 bg-rose-500/20 rounded shadow-lg shadow-rose-500/30 flex items-start justify-end p-1 pointer-events-none"
                style={{
                  top: `${ymin * 100}%`,
                  left: `${xmin * 100}%`,
                  height: `${boxHeight}%`,
                  width: `${boxWidth}%`,
                }}
              >
                <span className="text-[9px] font-mono bg-rose-600 text-white px-1 rounded font-bold">
                  DEFECT {defectPercent}%
                </span>
              </div>
            )}
          </div>

          {buyerStatement && (
            <p className="text-xs text-slate-400 italic bg-[#0c1424] p-2.5 rounded-lg border border-slate-800/80">
              Statement: "{buyerStatement}"
            </p>
          )}

          <div className="text-[11px] font-mono space-y-1 text-slate-400 pt-1">
            <div className="flex justify-between">
              <span>SOFTWARE EXIF:</span>
              <span className={exifTamperFlag ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                {exifSoftware}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CARRIER TRACKING:</span>
              <span className="text-cyan-400">{trackingNumber} ({carrierStatus})</span>
            </div>
          </div>
        </div>

        {/* Right: (L, R) Settlement Matrix Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-[#060b14] p-4 flex flex-col justify-between font-mono text-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-sans font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                (L, R) Deterministic Arbitration Scores
              </span>
              <span className="text-cyan-400 font-bold text-[11px]">Section 5.3 Grounded</span>
            </div>

            {/* Score Sliders */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Merchant Liability Score (L):</span>
                  <span className="text-white font-bold">{liabilityScoreL.toFixed(3)}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${liabilityScoreL * 100}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">S_defect + S_non_delivery</div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Buyer Abuse / Tamper Risk (R):</span>
                  <span className="text-rose-400 font-bold">{abuseRiskScoreR.toFixed(3)}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full transition-all duration-300" style={{ width: `${abuseRiskScoreR * 100}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">I_tamper + S_velocity</div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-2">
              Decision Rule: Because R = {abuseRiskScoreR.toFixed(2)} {abuseRiskScoreR >= 0.60 ? '>= 0.60' : '< 0.60'}, the autonomous arbiter selected{' '}
              <strong className="text-rose-400">{tierActionKey}</strong> to submit compiled forensic evidence.
            </p>
          </div>

          {/* Interactive HATEOAS Actions */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px]">AVAILABLE HATEOAS ACTIONS:</span>
              {lastExecutedAction && (
                <span className="text-emerald-400 text-[10px] font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Executed: {lastExecutedAction}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1 font-sans">
              <button
                onClick={() => handleAction('provide-evidence')}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                {internalSubmittingAction === 'provide-evidence' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileCheck className="w-3.5 h-3.5" />
                )}
                <span>Submit Defense Dossier</span>
              </button>

              <button
                onClick={() => handleAction('propose-offer')}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {internalSubmittingAction === 'propose-offer' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5" />
                )}
                <span>Propose 50% Offer ({formatCents(partialOfferCents)})</span>
              </button>

              <button
                onClick={() => handleAction('escalate-sla')}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {internalSubmittingAction === 'escalate-sla' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                <span>Escalate SLA via Bryntum</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
