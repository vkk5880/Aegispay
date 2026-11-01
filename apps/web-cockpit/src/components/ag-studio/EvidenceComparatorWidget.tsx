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
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-slate-50">
      <h3 className="text-lg font-semibold">Evidence Comparator</h3>

      <div className="flex justify-between items-center bg-white p-3 rounded-md shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Liability (L):</span>
          <div className="w-24 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${liabilityScoreL * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{(liabilityScoreL * 100).toFixed(1)}%</span>
        </div>

        {exifTamperFlag && (
          <div className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-200 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            EXIF TAMPER DETECTED
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Abuse Risk (R):</span>
          <div className="w-24 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500"
              style={{ width: `${abuseRiskScoreR * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{(abuseRiskScoreR * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded-md overflow-hidden bg-white shadow-sm flex flex-col">
          <div className="bg-gray-100 px-3 py-2 text-sm font-medium border-b text-center text-gray-700">
            Channel3 Studio Baseline
          </div>
          <div className="relative aspect-square flex items-center justify-center p-2 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={channel3CleanedUrl}
              alt="Channel3 Cleaned Reference"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>

        <div className="border rounded-md overflow-hidden bg-white shadow-sm flex flex-col">
          <div className="bg-gray-100 px-3 py-2 text-sm font-medium border-b text-center text-gray-700">
            Buyer Return Evidence
          </div>
          <div className="relative aspect-square flex items-center justify-center p-2 bg-white">
             {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buyerReturnPhotoUrl}
              alt="Buyer Return"
              className="max-w-full max-h-full object-contain"
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
                  stroke="rgba(239, 68, 68, 0.8)"
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
