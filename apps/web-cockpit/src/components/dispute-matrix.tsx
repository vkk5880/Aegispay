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
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface DisputeEvidenceData {
  disputeId: string;
  amountCents: number;
  reason: string;
  stage: 'INQUIRY' | 'CLAIM' | 'CHARGEBACK' | 'PRE_ARBITRATION' | 'ARBITRATION';
  defectBoundingBox?: [number, number, number, number];
  exifSoftware?: string;
  exifTamperFlag: boolean;
  liabilityScoreL: number;
  abuseRiskScoreR: number;
  tierAction: 'TIER1_REFUND' | 'TIER2_PARTIAL_OFFER' | 'TIER3_RETURN_OFFER' | 'TIER4_CONTEST_PDF' | 'TIER5_SLA_ESCALATE';
  partialOfferCents?: number;
  trackingNumber?: string;
  carrierStatus?: string;
  slaHoursRemaining: number;
}

export function DisputeMatrixViewer({
  evidence,
  onTriggerAction,
  submitting = false,
}: {
  evidence?: DisputeEvidenceData;
  onTriggerAction?: (actionRel: string) => void;
  submitting?: boolean;
}) {
  const [internalSubmitting, setInternalSubmitting] = useState(false);
  const isSubmitting = submitting || internalSubmitting;

  const data: DisputeEvidenceData = evidence || {
    disputeId: 'PP-D-849201',
    amountCents: 14900,
    reason: 'ITEM_NOT_AS_DESCRIBED',
    stage: 'INQUIRY',
    defectBoundingBox: [0.35, 0.4, 0.55, 0.65],
    exifSoftware: 'Adobe Photoshop 2026',
    exifTamperFlag: true,
    liabilityScoreL: 0.15,
    abuseRiskScoreR: 0.72,
    tierAction: 'TIER4_CONTEST_PDF',
    trackingNumber: '1Z9999999999999999',
    carrierStatus: 'DELIVERED_FRONT_DOOR',
    slaHoursRemaining: 18,
  };

  const tierActionKey = data.tierAction || 'TIER4_CONTEST_PDF';
  const tierColors = {
    TIER1_REFUND: 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40',
    TIER2_PARTIAL_OFFER: 'bg-indigo-950/60 text-indigo-400 border-indigo-500/40',
    TIER3_RETURN_OFFER: 'bg-blue-950/60 text-blue-400 border-blue-500/40',
    TIER4_CONTEST_PDF: 'bg-rose-950/60 text-rose-400 border-rose-500/40',
    TIER5_SLA_ESCALATE: 'bg-amber-950/60 text-amber-400 border-amber-500/40',
  }[tierActionKey] || 'bg-slate-800 text-slate-300 border-slate-700';

  // Safeguard coordinates [ymin, xmin, ymax, xmax] clamped within [0, 1]
  const rawBox = data.defectBoundingBox;
  const validBox = Array.isArray(rawBox) && rawBox.length === 4
    ? [
        Math.max(0, Math.min(1, Number(rawBox[0]) || 0)),
        Math.max(0, Math.min(1, Number(rawBox[1]) || 0)),
        Math.max(0, Math.min(1, Number(rawBox[2]) || 0)),
        Math.max(0, Math.min(1, Number(rawBox[3]) || 0)),
      ]
    : null;

  const ymin = validBox ? Math.min(validBox[0], validBox[2]) : 0;
  const xmin = validBox ? Math.min(validBox[1], validBox[3]) : 0;
  const ymax = validBox ? Math.max(validBox[0], validBox[2]) : 0;
  const xmax = validBox ? Math.max(validBox[1], validBox[3]) : 0;
  const boxHeight = (ymax - ymin) * 100;
  const boxWidth = (xmax - xmin) * 100;
  const defectPercent = Math.round((ymax - ymin) * (xmax - xmin) * 100);

  // Safeguard scores clamped within [0, 1]
  const liabilityScoreL = Math.max(0, Math.min(1, Number(data.liabilityScoreL) || 0));
  const abuseRiskScoreR = Math.max(0, Math.min(1, Number(data.abuseRiskScoreR) || 0));
  const slaRemaining = Math.max(0, Number(data.slaHoursRemaining) || 0);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setInternalSubmitting(true);
    try {
      if (onTriggerAction) {
        await onTriggerAction('provide-evidence');
      }
    } finally {
      setInternalSubmitting(false);
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
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Dispute Forensics Matrix
              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${tierColors}`}>
                {data.tierAction}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Dispute ID: {data.disputeId} • Stage: <span className="text-white font-mono">{data.stage}</span> • Amount: {formatCents(data.amountCents)}
            </p>
          </div>
        </div>

        {/* SLA Countdown Timer */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#060b14] border border-slate-800 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">SLA Due Date:</span>
          <span className={`font-bold ${slaRemaining <= 20 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
            {slaRemaining}h remaining
          </span>
        </div>
      </div>

      {/* Grid View: Vision Forensics + (L, R) Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Defect Bounding Box Viewer */}
        <div className="rounded-xl border border-slate-800 bg-[#060b14] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              Evidence Visual Analysis
            </span>
            {data.exifTamperFlag && (
              <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 rounded font-bold">
                EXIF TAMPER DETECTED
              </span>
            )}
          </div>

          <div className="relative aspect-video rounded-lg bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center">
            {/* Visual Bounding Box Box Representation */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center text-slate-600 text-xs font-mono">
              [Buyer Uploaded Evidence]
            </div>

            {validBox && boxHeight > 0 && boxWidth > 0 && (
              <div
                className="absolute border-2 border-rose-500 bg-rose-500/20 rounded shadow-lg shadow-rose-500/30 flex items-start justify-end p-1"
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

          <div className="text-[11px] font-mono space-y-1 text-slate-400 pt-1">
            <div className="flex justify-between">
              <span>SOFTWARE EXIF:</span>
              <span className={data.exifTamperFlag ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                {data.exifSoftware || 'Camera Raw (Untampered)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>CARRIER TRACKING:</span>
              <span className="text-cyan-400">{data.trackingNumber} ({data.carrierStatus})</span>
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
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${liabilityScoreL * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Buyer Abuse / Tamper Risk (R):</span>
                  <span className="text-rose-400 font-bold">{abuseRiskScoreR.toFixed(3)}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${abuseRiskScoreR * 100}%` }} />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-2">
              Decision Rule: Because R = {abuseRiskScoreR.toFixed(2)} {abuseRiskScoreR >= 0.60 ? '>= 0.60' : '< 0.60'}, the autonomous arbiter selected{' '}
              <strong className="text-rose-400">{tierActionKey}</strong> to submit compiled forensic evidence.
            </p>
          </div>

          {/* Action Trigger */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-500 text-[10px]">HATEOAS ACTION:</span>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-sans font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileCheck className="w-3.5 h-3.5" />
              )}
              <span>{isSubmitting ? 'Submitting Dossier...' : 'Submit Defense Dossier'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
