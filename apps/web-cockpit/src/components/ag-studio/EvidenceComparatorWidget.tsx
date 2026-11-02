'use client';

import React from 'react';

interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

interface EvidenceComparatorWidgetProps {
  channel3CleanedUrl: string;
  buyerReturnPhotoUrl: string;
  defectBoundingBox?: BoundingBox;
  exifTamperFlag: boolean;
  liabilityScoreL: number;
  abuseRiskScoreR: number;
}

export function EvidenceComparatorWidget({
  channel3CleanedUrl,
  buyerReturnPhotoUrl,
  defectBoundingBox,
  exifTamperFlag,
  liabilityScoreL,
  abuseRiskScoreR
}: EvidenceComparatorWidgetProps) {
  return (
    <div className="flex flex-col gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-[#080d19] text-slate-900 dark:text-slate-100 transition-colors">
      <h3 className="text-base font-bold text-slate-900 dark:text-white">Evidence Comparator (Gemini 3.8 Flash Vision)</h3>

      <div className="flex flex-wrap justify-between items-center gap-3 bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Liability (L):</span>
          <div className="w-24 h-3.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${liabilityScoreL * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">{(liabilityScoreL * 100).toFixed(1)}%</span>
        </div>

        {exifTamperFlag && (
          <div className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 text-[11px] font-bold rounded-full border border-rose-300 dark:border-rose-500/40 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            EXIF TAMPER DETECTED
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Abuse Risk (R):</span>
          <div className="w-24 h-3.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full"
              style={{ width: `${abuseRiskScoreR * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">{(abuseRiskScoreR * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#0c1424] shadow-xs flex flex-col">
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-300">
            Channel3 Studio Baseline Reference
          </div>
          <div className="relative aspect-square flex items-center justify-center p-2 bg-slate-100/50 dark:bg-slate-900/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={channel3CleanedUrl}
              alt="Channel3 Cleaned Reference"
              className="max-w-full max-h-full object-contain rounded"
            />
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#0c1424] shadow-xs flex flex-col">
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-300">
            Buyer Damaged Return Evidence
          </div>
          <div className="relative aspect-square flex items-center justify-center p-2 bg-slate-100/50 dark:bg-slate-900/50">
             {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buyerReturnPhotoUrl}
              alt="Buyer Return"
              className="max-w-full max-h-full object-contain rounded"
            />
            {defectBoundingBox && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                preserveAspectRatio="none"
              >
                <rect
                  x={`${defectBoundingBox.xmin * 100}%`}
                  y={`${defectBoundingBox.ymin * 100}%`}
                  width={`${(defectBoundingBox.xmax - defectBoundingBox.xmin) * 100}%`}
                  height={`${(defectBoundingBox.ymax - defectBoundingBox.ymin) * 100}%`}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.9)"
                  strokeWidth="3"
                  strokeDasharray="4"
                  className="animate-pulse"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
