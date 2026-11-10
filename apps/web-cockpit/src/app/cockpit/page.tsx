'use client';

import React, { useState } from 'react';
import { LayoutShell } from '@/components/common/LayoutShell';
import { ChatFlow } from '@/components/buyer/ChatFlow';
import { KnapsackCartView } from '@/components/knapsack-cart-view';
import { DisputeMatrixViewer } from '@/components/dispute-matrix';
import { Activity, Cpu } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

export default function CockpitTelemetryPage() {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'KNAPSACK' | 'DISPUTES'>('CHAT');
  const { showTechnicalDetails } = useUiMode();

  return (
    <LayoutShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Cockpit Header Card */}
        <div className="relative p-6 rounded-2xl bg-white/90 dark:bg-[#0c1424]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Top radiant border light */}
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-2xl text-white shadow-lg shadow-cyan-500/25">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                {showTechnicalDetails
                  ? 'AegisPay Autonomous Clearinghouse Cockpit'
                  : 'Store & Shopping Protection Center'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                {showTechnicalDetails
                  ? 'Real-time transaction telemetry, deterministic scoring, immutable audit chain, and conversational agent.'
                  : 'Real-time budget safety, smart multi-store cart, and PayPal purchase protection.'}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-[#060b14] border border-slate-200/80 dark:border-white/10 shadow-inner" role="tablist" aria-label="Cockpit telemetry views">
            <button
              role="tab"
              aria-selected={activeTab === 'CHAT'}
              onClick={() => setActiveTab('CHAT')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'CHAT'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
              }`}
            >
              {showTechnicalDetails ? 'Buyer Chat & Intent' : 'Shopping Assistant'}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'KNAPSACK'}
              onClick={() => setActiveTab('KNAPSACK')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'KNAPSACK'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
              }`}
            >
              {showTechnicalDetails ? 'Knapsack Cart' : 'Multi-Store Cart'}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'DISPUTES'}
              onClick={() => setActiveTab('DISPUTES')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'DISPUTES'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
              }`}
            >
              {showTechnicalDetails ? 'Dispute Forensics' : 'Resolution Center'}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'CHAT' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ChatFlow />
            </div>
            <div className="space-y-6">
              <div className="relative p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0c1424]/90 backdrop-blur-xl shadow-lg shadow-black/5 dark:shadow-black/20 space-y-3.5 font-mono text-xs overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

                <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold pb-2.5 border-b border-slate-100 dark:border-white/5">
                  <Activity className="w-4 h-4" />
                  <span>{showTechnicalDetails ? 'Telemetry Health' : 'Protection Status'}</span>
                </div>
                <div className="space-y-2.5 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold">{showTechnicalDetails ? 'LUA ENFORCER:' : 'BUDGET PROTECTION:'}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'SUB-MILLI PASS (<1ms)' : 'ACTIVE & VERIFIED'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold">{showTechnicalDetails ? 'VAULT v3 TOKEN:' : 'PAYPAL VAULT:'}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'ACTIVE' : 'CONNECTED'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold">{showTechnicalDetails ? '3DS LIABILITY SHIFT:' : 'PURCHASE PROTECTION:'}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'VERIFIED' : 'ACTIVE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold">{showTechnicalDetails ? 'AUDIT HASH CHAIN:' : 'OFFICIAL RECEIPTS:'}</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                      {showTechnicalDetails ? 'RFC 8785 SYNCED' : 'PROTECTED'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'KNAPSACK' && <KnapsackCartView />}

        {activeTab === 'DISPUTES' && <DisputeMatrixViewer />}
      </div>
    </LayoutShell>
  );
}
