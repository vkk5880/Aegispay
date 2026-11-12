'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AutonomyDialWidget } from '@/components/ag-studio/AutonomyDialWidget';
import { EvidenceComparatorWidget } from '@/components/ag-studio/EvidenceComparatorWidget';
import { HateoasDisputeActionRenderer } from '@/components/ag-studio/HateoasDisputeActionRenderer';
import { LiveStudioCanvas } from '@/components/ag-studio/LiveStudioCanvas';
import { DashboardReports } from '@/components/merchant/DashboardReports';
import {
  Store,
  Database,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  LogIn,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';
import { webLogger as logger } from '@/lib/logger';
import { getApiBaseUrl } from '@/lib/utils';

const DisputeSlaScheduler = dynamic(
  () =>
    import('@/components/bryntum/DisputeSlaScheduler')
      .then((mod) => {
        logger.info('[MerchantCockpitPage] Dynamic DisputeSlaScheduler chunk loaded successfully');
        return mod.DisputeSlaScheduler;
      })
      .catch((err) => {
        logger.error('[MerchantCockpitPage] Failed to dynamically load DisputeSlaScheduler chunk', {
          error: err?.message,
          stack: err?.stack,
        });
        throw err;
      }),
  {
    ssr: false,
    loading: () => {
      logger.debug('[MerchantCockpitPage] DisputeSlaScheduler chunk loading fallback rendered');
      return (
        <div className="flex items-center justify-center p-6 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-[#080d19]/50 min-h-[300px] text-slate-400 text-xs">
          <span className="font-mono">Loading Bryntum SLA Scheduler...</span>
        </div>
      );
    },
  }
);

export default function MerchantCockpitPage() {
  const { showTechnicalDetails } = useUiMode();
  const { user, isLoggedIn, openAuthModal } = useAuth();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [isLoadingDisputes, setIsLoadingDisputes] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const fetchDisputes = async () => {
    setIsLoadingDisputes(true);
    try {
      const orchestratorUrl = getApiBaseUrl();
      const res = await fetch(`${orchestratorUrl}/api/merchant/disputes`);
      if (res.ok) {
        const data = await res.json();
        setDisputes(Array.isArray(data.disputes) ? data.disputes : []);
        logger.info(`[MerchantCockpitPage] Loaded ${data.disputes?.length || 0} live merchant disputes`);
      }
    } catch (err: any) {
      logger.debug('[MerchantCockpitPage] Live disputes fetch notice:', err?.message);
    } finally {
      setIsLoadingDisputes(false);
    }
  };

  const handleSeedSandbox = async () => {
    setIsSeeding(true);
    setSeedNotice(null);
    try {
      const orchestratorUrl = getApiBaseUrl();
      const res = await fetch(`${orchestratorUrl}/api/merchant/seed-sandbox`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSeedNotice('✅ Live PayPal Sandbox seeded with products, subscription plans & invoices!');
        await fetchDisputes();
      } else {
        setSeedNotice(`Notice: ${data.message || 'Seeding initiated'}`);
      }
    } catch (err: any) {
      setSeedNotice('Failed to connect to PayPal sandbox seeder.');
    } finally {
      setIsSeeding(false);
      setTimeout(() => setSeedNotice(null), 5000);
    }
  };

  useEffect(() => {
    logger.info('[MerchantCockpitPage] Mounted Merchant Cockpit page', {
      showTechnicalDetails,
      isLoggedIn,
      userEmail: user?.email,
      timestamp: new Date().toISOString(),
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'SSR',
    });

    fetchDisputes();

    return () => {
      logger.info('[MerchantCockpitPage] Unmounting Merchant Cockpit page');
    };
  }, [showTechnicalDetails, isLoggedIn, user?.email]);

  const activeDisputeWithEvidence = disputes.find(
    (d) => d.buyer_image_url || d.evidence_image_url || (Array.isArray(d.images) && d.images.length > 0)
  );

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full transition-colors">
      {/* Header Banner */}
      <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/90 dark:bg-[#0c1424]/90 backdrop-blur-xl p-6 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-slate-200/80 dark:border-white/10 overflow-hidden">
        {/* Top subtle radiant border light */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-2xl text-white shadow-lg shadow-cyan-500/25">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {showTechnicalDetails ? 'Merchant Arbitration Cockpit' : 'Seller Resolution Center'}
              {showTechnicalDetails && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30">
                  Layer 6
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              {showTechnicalDetails
                ? 'AG Studio 3 multi-agent harness, DuckDB-WASM analytics & Bryntum SLA scheduler'
                : 'Automated return inspection, customer dispute resolution, and settlement analytics'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-[#0e172a] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Buyer Portal
          </Link>
          <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-mono font-bold border border-emerald-500/30 shadow-xs">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            {showTechnicalDetails ? 'DuckDB-WASM: Ready' : 'Analytics Engine: Active'}
          </span>
        </div>
      </div>

      {/* Linked User / Merchant Account Identity Banner */}
      <div className="relative p-4 rounded-2xl bg-white/80 dark:bg-[#0b1324]/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-md shadow-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isLoggedIn && user ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'}`}>
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Connected Merchant Profile
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${isLoggedIn && user ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
                {isLoggedIn && user ? 'PayPal Account Active' : 'Sandbox Identity'}
              </span>
            </div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {user?.name || 'PayPal Sandbox Merchant'}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">
                ({user?.email || 'sb-merchant@business.example.com'})
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {user?.budgetCapCents && user.budgetCapCents > 0 ? (
            <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
              Vault Allowance: ${(user.budgetCapCents / 100).toFixed(2)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleSeedSandbox}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            title="Seed live products, subscription plans, and invoices into PayPal Sandbox"
          >
            {isSeeding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-500" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            )}
            {isSeeding ? 'Seeding PayPal...' : 'Seed PayPal Sandbox'}
          </button>
          {!isLoggedIn ? (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-600/20"
            >
              <LogIn className="w-3.5 h-3.5" />
              Connect PayPal Account
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Live Account Linked
            </span>
          )}
        </div>
      </div>

      {seedNotice && (
        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 dark:text-cyan-200 text-xs font-bold flex items-center justify-between animate-in fade-in">
          <span>{seedNotice}</span>
          <button
            type="button"
            onClick={() => setSeedNotice(null)}
            className="text-cyan-600 dark:text-cyan-400 hover:underline ml-4 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Merchant Reporting & APIMatic Overview */}
      <DashboardReports />

      {/* Merchant Autonomy Dial Configuration */}
      <AutonomyDialWidget initialMode="SUPERVISED" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AG Studio Canvas & Visualizers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active AG Studio 3 Canvas */}
          <LiveStudioCanvas />

          {/* Vision Forensics Evidence */}
          <div className="bg-white dark:bg-[#0b1324] rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 p-5">
            {activeDisputeWithEvidence ? (
              <EvidenceComparatorWidget
                channel3CleanedUrl={activeDisputeWithEvidence.catalog_cleaned_image_url || activeDisputeWithEvidence.channel3_cleaned_url || ''}
                buyerReturnPhotoUrl={activeDisputeWithEvidence.buyer_image_url || activeDisputeWithEvidence.buyer_return_photo_url || ''}
                defectBoundingBox={activeDisputeWithEvidence.defect_bounding_box}
                exifTamperFlag={Boolean(activeDisputeWithEvidence.exif_tamper_flag)}
                liabilityScoreL={activeDisputeWithEvidence.liability_score_l ?? 0.5}
                abuseRiskScoreR={activeDisputeWithEvidence.abuse_risk_score_r ?? 0.5}
              />
            ) : (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
                <div className="p-3.5 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-xs">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Vision Forensics Comparator Ready
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mt-1 leading-relaxed">
                    No active return disputes awaiting visual defect verification. When a buyer submits a photo claim, Channel3 and Gemini 3.8 Flash Vision will automatically perform side-by-side defect inspection here.
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Live PayPal Ground-Truth Active
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Bryntum SLA & Action Console */}
        <div className="space-y-6">
          <DisputeSlaScheduler />

          {/* HATEOAS Action Resolution */}
          <div className="relative bg-white/90 dark:bg-[#0c1424]/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-slate-200/80 dark:border-white/10 overflow-hidden">
            {/* Top radiant border light */}
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

            <div className="bg-slate-50/90 dark:bg-[#080d19]/90 border-b border-slate-200/80 dark:border-white/5 px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center justify-between">
              <span className="font-extrabold text-slate-900 dark:text-white">
                {showTechnicalDetails ? 'HATEOAS Action Resolution' : 'One-Click Dispute Actions'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-bold">
                {showTechnicalDetails ? 'RFC 5988 Links' : 'Live PayPal Actions'}
              </span>
            </div>

            <div className="p-4 space-y-3.5">
              {isLoadingDisputes ? (
                <div className="p-6 text-center text-xs text-slate-400 font-mono">
                  Loading live disputes from PayPal...
                </div>
              ) : disputes.length > 0 ? (
                disputes.map((d, idx) => {
                  const disputeId = d.dispute_id || d.id || `PP-D-${idx + 1}`;
                  const allowedActions = Array.isArray(d.links)
                    ? d.links.map((l: any) => l.rel).filter(Boolean)
                    : ['provide-evidence', 'make-offer'];
                  const amountStr = d.dispute_amount?.value
                    ? `${d.dispute_amount.value} ${d.dispute_amount.currency_code || 'USD'}`
                    : '';

                  return (
                    <div
                      key={disputeId}
                      className="bg-slate-50/80 dark:bg-[#080e1c]/80 border border-slate-200/80 dark:border-white/5 rounded-xl p-3.5 space-y-1.5 shadow-xs"
                    >
                      <div className="text-[11px] font-mono text-slate-500 font-semibold flex items-center justify-between">
                        <span>{showTechnicalDetails ? `Dispute ID: ${disputeId}` : `Case: ${disputeId}`}</span>
                        {amountStr && <span className="text-slate-700 dark:text-slate-300 font-bold">{amountStr}</span>}
                      </div>
                      <div className="font-bold text-xs text-amber-600 dark:text-amber-400">
                        {(d.reason || 'Customer Claim').replace(/_/g, ' ')}
                      </div>
                      <HateoasDisputeActionRenderer
                        disputeId={disputeId}
                        hateoasAllowedActions={allowedActions.length > 0 ? allowedActions : ['provide-evidence']}
                        links={d.links}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center min-h-[160px] space-y-2">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Zero Active Disputes</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                    All PayPal transactions are in good standing. No HATEOAS dispute actions pending seller resolution.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
