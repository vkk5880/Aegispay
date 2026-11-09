'use client';

import React, { useState } from 'react';
import { LayoutShell } from '@/components/common/LayoutShell';
import { ChatFlow } from '@/components/buyer/ChatFlow';
import { KnapsackCartView } from '@/components/knapsack-cart-view';
import { DisputeMatrixViewer } from '@/components/dispute-matrix';
import { ShieldCheck, Activity, Cpu, Layers, Terminal } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

export default function CockpitTelemetryPage() {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'KNAPSACK' | 'DISPUTES'>('CHAT');
  const { showTechnicalDetails } = useUiMode();

  return (
    <LayoutShell>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Cockpit Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-950/60 border border-cyan-500/30 rounded-2xl text-cyan-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                {showTechnicalDetails
                  ? 'AegisPay Autonomous Clearinghouse Cockpit'
                  : 'Store & Shopping Protection Center'}
              </h1>
              <p className="text-xs text-slate-400">
                {showTechnicalDetails
                  ? 'Real-time transaction telemetry, deterministic scoring, immutable audit chain, and conversational agent.'
                  : 'Real-time budget safety, smart multi-store cart, and PayPal purchase protection.'}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#060b14] border border-slate-800" role="tablist" aria-label="Cockpit telemetry views">
            <button
              role="tab"
              aria-selected={activeTab === 'CHAT'}
              onClick={() => setActiveTab('CHAT')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'CHAT' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              {showTechnicalDetails ? 'Buyer Chat & Intent' : 'Shopping Assistant'}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'KNAPSACK'}
              onClick={() => setActiveTab('KNAPSACK')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'KNAPSACK' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              {showTechnicalDetails ? 'Knapsack Cart' : 'Multi-Store Cart'}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'DISPUTES'}
              onClick={() => setActiveTab('DISPUTES')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'DISPUTES' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
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
              <div className="p-5 rounded-2xl border border-slate-800 bg-[#0c1424] space-y-3 font-mono text-xs">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold pb-2 border-b border-slate-800">
                  <Activity className="w-4 h-4" />
                  <span>{showTechnicalDetails ? 'Telemetry Health' : 'Protection Status'}</span>
                </div>
                <div className="space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>{showTechnicalDetails ? 'LUA ENFORCER:' : 'BUDGET PROTECTION:'}</span>
                    <span className="text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'SUB-MILLI PASS (<1ms)' : 'ACTIVE & VERIFIED'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{showTechnicalDetails ? 'VAULT v3 TOKEN:' : 'PAYPAL VAULT:'}</span>
                    <span className="text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'ACTIVE' : 'CONNECTED'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{showTechnicalDetails ? '3DS LIABILITY SHIFT:' : 'PURCHASE PROTECTION:'}</span>
                    <span className="text-emerald-400 font-bold">
                      {showTechnicalDetails ? 'VERIFIED' : 'ACTIVE'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{showTechnicalDetails ? 'AUDIT HASH CHAIN:' : 'OFFICIAL RECEIPTS:'}</span>
                    <span className="text-cyan-400 font-bold">
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
