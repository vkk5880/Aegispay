'use client';

import React from 'react';
import Link from 'next/link';
import { EvidenceComparatorWidget } from '@/components/ag-studio/EvidenceComparatorWidget';
import { HateoasDisputeActionRenderer } from '@/components/ag-studio/HateoasDisputeActionRenderer';
import { DisputeSlaScheduler } from '@/components/bryntum/DisputeSlaScheduler';

export default function MerchantCockpitPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-100 p-6 space-y-6">
      <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Merchant Cockpit</h1>
          <p className="text-sm text-slate-500">AG Studio 3, DuckDB-WASM, & Bryntum SLA Integration</p>
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/" className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            &larr; Back to Buyer Portal
          </Link>
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium border border-green-200">
            DuckDB-WASM: Ready
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AG Studio Canvas & Visualizers */}
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col h-[500px]">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold text-slate-700">
              AG Studio 3 Canvas (Arbiter Agent Console)
            </div>
            <div className="flex-1 bg-slate-800 flex items-center justify-center relative p-6">
               <div className="text-center">
                  <div className="text-slate-400 mb-2"><code>studio.registerToolRunner(&apos;paypal_arbiter&apos;)</code></div>
                  <h2 className="text-xl font-medium text-slate-200">Multi-Agent Arbitration Cockpit Connected</h2>
                  <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                    Streaming cross-filtered insights via <code>api.defineAiCommand(&apos;isolate_high_risk_disputes&apos;)</code>
                    and computing <code>Net_Retained_Margin</code> inline.
                  </p>
               </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-slate-700 mb-4">Vision Forensics Evidence</h3>
            <EvidenceComparatorWidget
              channel3CleanedUrl="https://placehold.co/400x400/f8fafc/94a3b8?text=Studio+Baseline"
              buyerReturnPhotoUrl="https://placehold.co/400x400/f8fafc/94a3b8?text=Shattered+Screen"
              defectBoundingBox={{ ymin: 0.3, xmin: 0.4, ymax: 0.7, xmax: 0.8 }}
              exifTamperFlag={true}
              liabilityScoreL={0.15}
              abuseRiskScoreR={0.82}
            />
          </div>

        </div>

        {/* Right Column: Bryntum SLA & Action Console */}
        <div className="space-y-6">

          <DisputeSlaScheduler />

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="bg-slate-50 border-b px-4 py-3 font-semibold text-slate-700">
              HATEOAS Action Resolution
            </div>
            <div className="p-4 space-y-4">
              <div className="border rounded p-3">
                <div className="text-xs text-slate-500 mb-1">Dispute ID: PP-D-1002</div>
                <div className="font-medium text-sm mb-2">High Abuse Risk Detected (R=0.82)</div>
                <HateoasDisputeActionRenderer
                  disputeId="PP-D-1002"
                  hateoasAllowedActions={['provide-evidence']}
                />
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-slate-500 mb-1">Dispute ID: PP-D-1003</div>
                <div className="font-medium text-sm mb-2">Cosmetic Defect (L=0.45)</div>
                <HateoasDisputeActionRenderer
                  disputeId="PP-D-1003"
                  hateoasAllowedActions={['make-offer']}
                />
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-slate-500 mb-1">Synthetic Intent Bid</div>
                <div className="font-medium text-sm mb-2">Vault Token Matching</div>
                <HateoasDisputeActionRenderer
                  disputeId="SYN-B-999"
                  hateoasAllowedActions={['accept-claim']}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
