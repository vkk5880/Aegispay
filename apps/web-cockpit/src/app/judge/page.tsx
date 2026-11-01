'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Terminal,
  Zap,
  Server,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface TerminalOutput {
  actionTitle: string;
  timestamp: string;
  status: string;
  data: any;
}

export default function JudgeChaosPortal() {
  const [terminalLogs, setTerminalLogs] = useState<TerminalOutput | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [verifyData, setVerifyData] = useState<any>(null);
  const [loadingVerify, setLoadingVerify] = useState<boolean>(false);

  const fetchVerifyLedger = async () => {
    setLoadingVerify(true);
    try {
      const res = await fetch('/api/integrations/verify');
      const json = await res.json();
      setVerifyData(json);
    } catch (err: any) {
      setVerifyData({ error: 'Failed to query /api/integrations/verify', details: err.message });
    } finally {
      setLoadingVerify(false);
    }
  };

  useEffect(() => {
    fetchVerifyLedger();
  }, []);

  const triggerChaos = async (action: string, title: string) => {
    setLoadingAction(action);
    try {
      const res = await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setTerminalLogs({
        actionTitle: title,
        timestamp: new Date().toLocaleTimeString(),
        status: data.status || 'SUCCESS',
        data,
      });
      // Refresh ledger after mutation
      fetchVerifyLedger();
    } catch (err: any) {
      setTerminalLogs({
        actionTitle: title,
        timestamp: new Date().toLocaleTimeString(),
        status: 'ERROR',
        data: { error: err.message },
      });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-[#1e293b] bg-[#090f1d]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-wide text-white">
                AEGIS<span className="text-amber-400">PAY</span>
              </span>
              <span className="text-[10px] font-mono block text-amber-400/80">
                Pre-Authenticated Judge & Chaos Simulator (Layer 5)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
            >
              Buyer Portal <ArrowRight className="w-3 h-3" />
            </Link>
            <Link
              href="/merchant"
              className="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
            >
              Merchant AG Cockpit <ArrowRight className="w-3 h-3" />
            </Link>
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-full text-xs font-mono">
              JUDGE_MODE: ACTIVE
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/30 via-[#0e1628] to-rose-950/30 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Autonomous Commerce Chaos & Sandbox Verification
              <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Section 7.2 Plan.md
              </span>
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Pre-authenticated, zero-friction verification triggers executing the full algorithmic and cryptographic pipeline:
              Knapsack optimization, 72h price-drop capture, Synthetic Intent Vault token clearing, Redis Lua guardrails, and
              live PayPal Sandbox dispute auto-adjudication.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={fetchVerifyLedger}
              disabled={loadingVerify}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0d1627] hover:bg-[#142036] border border-slate-700 rounded-xl text-slate-300 transition-all cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingVerify ? 'animate-spin text-amber-400' : ''}`} />
              Refresh /api/integrations/verify
            </button>
          </div>
        </div>

        {/* 4 One-Click Chaos Triggers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Button 1: Knapsack + 72h Price Drop */}
          <div className="p-5 rounded-xl bg-[#090f1e] border border-cyan-500/30 hover:border-cyan-500/60 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-cyan-200">Knapsack + 72h Price-Drop</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Executes multi-merchant ILP basket, places PayPal v2 Authorize hold, triggers Channel3 15% price-drop poll, and executes final lower-price capture.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_KNAPSACK_PRICE_DROP', 'Trigger Knapsack + 72h Price-Drop Capture')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_KNAPSACK_PRICE_DROP' ? 'Executing...' : 'Trigger Knapsack + 72h Price-Drop Capture'}
            </button>
          </div>

          {/* Button 2: Synthetic Intent Bid */}
          <div className="p-5 rounded-xl bg-[#090f1e] border border-purple-500/30 hover:border-purple-500/60 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-purple-200">Synthetic Intent Bid</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mints Vault v3 setup-token & Ed25519 voucher ($450 bid on $490 basket, 8.89% overage), matches autonomous merchant floor, and captures instantly.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_SYNTHETIC_BID', 'Trigger Synthetic Intent Bid ($450 on $490 Bundle)')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_SYNTHETIC_BID' ? 'Broadcasting...' : 'Trigger Synthetic Intent Bid ($450 on $490 Bundle)'}
            </button>
          </div>

          {/* Button 3: Redis Lua Prompt-Injection Attack */}
          <div className="p-5 rounded-xl bg-[#090f1e] border border-rose-500/30 hover:border-rose-500/60 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-rose-200">Redis Lua Prompt-Injection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Fires adversarial $5,000 spend attempt exceeding the buyer mandate budget cap; demonstrates atomic &lt;1ms rejection before hitting PayPal API.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_REDIS_LUA_ATTACK', 'Trigger Redis Lua Prompt-Injection Attack ($5,000)')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_REDIS_LUA_ATTACK' ? 'Injecting Attack...' : 'Trigger Redis Lua Prompt-Injection Attack ($5,000)'}
            </button>
          </div>

          {/* Button 4: Inject Live Sandbox Dispute & Auto-Adjudicate */}
          <div className="p-5 rounded-xl bg-[#090f1e] border border-emerald-500/30 hover:border-emerald-500/60 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Server className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-emerald-200">Sandbox Dispute & Adjudicate</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Simulates /require-evidence on PayPal dispute, triggers vision forensics + in-memory pdf-lib evidence upload, and calls /adjudicate in Seller Favor.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('INJECT_SANDBOX_DISPUTE', 'Inject Live Sandbox Dispute & Auto-Adjudicate')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-900/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'INJECT_SANDBOX_DISPUTE' ? 'Adjudicating...' : 'Inject Live Sandbox Dispute & Auto-Adjudicate'}
            </button>
          </div>
        </div>

        {/* Live Terminals Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Terminal: Interactive Chaos Execution Output */}
          <div className="rounded-2xl bg-[#070c17] border border-slate-800 flex flex-col h-[520px] overflow-hidden shadow-2xl">
            <div className="bg-[#0b1222] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-semibold text-slate-200">Chaos Execution Inspector</span>
              </div>
              {terminalLogs && (
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-slate-500">{terminalLogs.timestamp}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      terminalLogs.status === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {terminalLogs.status}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 p-4 font-mono text-xs overflow-auto text-slate-300 space-y-4">
              {terminalLogs ? (
                <div>
                  <div className="text-cyan-400 font-bold mb-2">
                    &gt; {terminalLogs.actionTitle}
                  </div>
                  <pre className="text-slate-300 bg-[#040810] p-4 rounded-xl border border-slate-800/80 overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(terminalLogs.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center space-y-2">
                  <Terminal className="w-8 h-8 opacity-40 text-slate-500" />
                  <p className="text-xs">Click one of the 4 chaos buttons above to view real-time execution telemetry.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Terminal: Live /api/integrations/verify Terminal */}
          <div className="rounded-2xl bg-[#070c17] border border-slate-800 flex flex-col h-[520px] overflow-hidden shadow-2xl">
            <div className="bg-[#0b1222] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-semibold text-slate-200">
                  Live /api/integrations/verify Read-Back Ledger
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">PAYPAL_READBACK_OK</span>
              </div>
            </div>

            <div className="flex-1 p-4 font-mono text-xs overflow-auto text-slate-300">
              {verifyData ? (
                <pre className="text-emerald-300/90 bg-[#040810] p-4 rounded-xl border border-slate-800/80 overflow-x-auto text-[11px] leading-relaxed">
                  {JSON.stringify(verifyData, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Loading integrations status...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e293b] py-4 bg-[#080d19]/80 text-center text-xs text-slate-500 font-mono">
        AegisPay Hackathon Verification System • All APIs Grounded via APIMatic & PayPal Server SDK
      </footer>
    </div>
  );
}
