'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AutonomyDialWidget } from '@/components/ag-studio/AutonomyDialWidget';
import { EvidenceComparatorWidget } from '@/components/ag-studio/EvidenceComparatorWidget';
import { HateoasDisputeActionRenderer } from '@/components/ag-studio/HateoasDisputeActionRenderer';
import { DashboardReports } from '@/components/merchant/DashboardReports';
import { Store, Database, ArrowLeft, Bot, Sparkles } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

const DisputeSlaScheduler = dynamic(
  () => import('@/components/bryntum/DisputeSlaScheduler').then((mod) => mod.DisputeSlaScheduler),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-[#080d19]/50 min-h-[300px] text-slate-400 text-xs">
        <span className="font-mono">Loading Bryntum SLA Scheduler...</span>
      </div>
    ),
  }
);

export default function MerchantCockpitPage() {
  const { showTechnicalDetails } = useUiMode();

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full transition-colors">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#0b1324] p-5 rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {showTechnicalDetails ? 'Merchant Arbitration Cockpit' : 'Seller Resolution Center'}
              {showTechnicalDetails && (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                  Layer 6
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {showTechnicalDetails
                ? 'AG Studio 3 multi-agent harness, DuckDB-WASM analytics & Bryntum SLA scheduler'
                : 'Automated return inspection, customer dispute resolution, and settlement analytics'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Buyer Portal
          </Link>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-lg text-xs font-mono font-bold border border-emerald-300 dark:border-emerald-500/40">
            <Database className="w-3.5 h-3.5" />
            {showTechnicalDetails ? 'DuckDB-WASM: Ready' : 'Analytics Engine: Active'}
          </span>
        </div>
      </div>

      {/* Merchant Reporting & APIMatic Overview */}
      <DashboardReports />

      {/* Merchant Autonomy Dial Configuration */}
      <AutonomyDialWidget initialMode="SUPERVISED" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AG Studio Canvas & Visualizers */}
        <div className="lg:col-span-2 space-y-6">
          {/* AG Studio 3 Harness */}
          <div className="bg-white dark:bg-[#0b1324] rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[480px]">
            <div className="bg-slate-50 dark:bg-[#080d19] border-b border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                {showTechnicalDetails
                  ? 'AG Studio 3 Canvas (Arbiter Agent Console)'
                  : 'Automated Dispute Resolution Canvas'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                {showTechnicalDetails ? 'Studio v3.0' : 'Active'}
              </span>
            </div>

            <div className="flex-1 bg-slate-900 dark:bg-[#060b14] flex items-center justify-center relative p-6">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:20px_20px]" />
              <div className="text-center relative z-10 max-w-md">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 mx-auto flex items-center justify-center text-cyan-400 mb-3 shadow-lg">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                {showTechnicalDetails && (
                  <div className="text-slate-400 mb-2 font-mono text-xs">
                    <code>studio.registerToolRunner(&apos;paypal_arbiter&apos;)</code>
                  </div>
                )}
                <h2 className="text-lg font-bold text-white mb-2">
                  {showTechnicalDetails
                    ? 'Multi-Agent Arbitration Cockpit Connected'
                    : 'Automated Dispute Intelligence Connected'}
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {showTechnicalDetails ? (
                    <>
                      Streaming cross-filtered insights via{' '}
                      <code>api.defineAiCommand(&apos;isolate_high_risk_disputes&apos;)</code> and computing{' '}
                      <code>Net_Retained_Margin</code> inline across 1,000 seeded sandbox disputes.
                    </>
                  ) : (
                    'AI-assisted return inspection, fraud defense, and instant PayPal claim resolution are actively protecting your store margins.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Vision Forensics Evidence */}
          <div className="bg-white dark:bg-[#0b1324] rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 p-5">
            <EvidenceComparatorWidget
              channel3CleanedUrl="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80"
              buyerReturnPhotoUrl="https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80"
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

          {/* HATEOAS Action Resolution */}
          <div className="bg-white dark:bg-[#0b1324] rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-slate-50 dark:bg-[#080d19] border-b border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center justify-between">
              <span>{showTechnicalDetails ? 'HATEOAS Action Resolution' : 'One-Click Dispute Actions'}</span>
              <span className="text-[10px] font-mono text-slate-500">
                {showTechnicalDetails ? 'RFC 5988 Links' : 'Live PayPal Actions'}
              </span>
            </div>

            <div className="p-4 space-y-3.5">
              <div className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] font-mono text-slate-500">
                  {showTechnicalDetails ? 'Dispute ID: PP-D-1002' : 'Case: PP-D-1002'}
                </div>
                <div className="font-bold text-xs text-rose-600 dark:text-rose-400">
                  {showTechnicalDetails ? 'High Abuse Risk Detected (R=0.82)' : 'High Risk of Fraud Detected'}
                </div>
                <HateoasDisputeActionRenderer
                  disputeId="PP-D-1002"
                  hateoasAllowedActions={['provide-evidence']}
                />
              </div>

              <div className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] font-mono text-slate-500">
                  {showTechnicalDetails ? 'Dispute ID: PP-D-1003' : 'Case: PP-D-1003'}
                </div>
                <div className="font-bold text-xs text-amber-600 dark:text-amber-400">
                  {showTechnicalDetails ? 'Cosmetic Defect Claim (L=0.45)' : 'Cosmetic Defect Claim'}
                </div>
                <HateoasDisputeActionRenderer
                  disputeId="PP-D-1003"
                  hateoasAllowedActions={['make-offer']}
                />
              </div>

              <div className="bg-slate-50 dark:bg-[#080d19] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] font-mono text-slate-500">
                  {showTechnicalDetails ? 'Synthetic Intent Bid: SYN-B-999' : 'Price Match Offer: #999'}
                </div>
                <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  {showTechnicalDetails ? 'Vault Token Reserve Floor Matched' : 'Customer Price Match Target Met'}
                </div>
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
