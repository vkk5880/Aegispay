'use client';

import React, { useState } from 'react';
import { LayoutShell } from '@/components/common/LayoutShell';
import { ChatFlow } from '@/components/buyer/ChatFlow';
import { KnapsackCartView } from '@/components/knapsack-cart-view';
import { DisputeMatrixViewer } from '@/components/dispute-matrix';
import { ShieldCheck, Activity, Cpu, Layers, Terminal } from 'lucide-react';

export default function CockpitTelemetryPage() {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'KNAPSACK' | 'DISPUTES'>('CHAT');

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
                AegisPay Autonomous Clearinghouse Cockpit
              </h1>
              <p className="text-xs text-slate-400">
                Real-time transaction telemetry, deterministic scoring, immutable audit chain, and conversational agent.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#060b14] border border-slate-800">
            <button
              onClick={() => setActiveTab('CHAT')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'CHAT' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Buyer Chat & Intent
            </button>
            <button
              onClick={() => setActiveTab('KNAPSACK')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'KNAPSACK' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Knapsack Cart
            </button>
            <button
              onClick={() => setActiveTab('DISPUTES')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'DISPUTES' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dispute Forensics
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
                  <span>Telemetry Health</span>
                </div>
                <div className="space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span>LUA ENFORCER:</span>
                    <span className="text-emerald-400 font-bold">SUB-MILLI PASS (&lt;1ms)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAULT v3 TOKEN:</span>
                    <span className="text-emerald-400 font-bold">ACTIVE</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3DS LIABILITY SHIFT:</span>
                    <span className="text-emerald-400 font-bold">VERIFIED</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AUDIT HASH CHAIN:</span>
                    <span className="text-cyan-400 font-bold">RFC 8785 SYNCED</span>
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
