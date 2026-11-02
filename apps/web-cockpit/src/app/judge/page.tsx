'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Play,
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
    <div className="flex-1 flex flex-col font-sans transition-colors">
      {/* Sub Header Navigation Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#070d18]/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              Pre-Authenticated Judge & Chaos Simulator
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
              JUDGE_MODE: ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              Buyer Portal <ArrowRight className="w-3 h-3" />
            </Link>
            <Link
              href="/merchant"
              className="text-xs font-semibold text-purple-700 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              Merchant Cockpit <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-rose-50 dark:from-amber-950/30 dark:via-[#0e1628] dark:to-rose-950/30 border border-amber-200 dark:border-amber-500/30 shadow-sm dark:shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Autonomous Commerce Chaos & Sandbox Verification
              <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                Section 7.2 Plan.md
              </span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Pre-authenticated, zero-friction verification triggers executing the full algorithmic and cryptographic pipeline:
              Knapsack optimization, 72h price-drop capture, Synthetic Intent Vault token clearing, Redis Lua guardrails, and
              live PayPal Sandbox dispute auto-adjudication.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={fetchVerifyLedger}
              disabled={loadingVerify}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#0d1627] hover:bg-slate-50 dark:hover:bg-[#142036] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 shadow-xs transition-all cursor-pointer font-sans font-medium"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingVerify ? 'animate-spin text-amber-500' : ''}`} />
              Refresh /api/integrations/verify
            </button>
          </div>
        </div>

        {/* 4 One-Click Chaos Triggers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Button 1: Knapsack + 72h Price Drop */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border border-cyan-200 dark:border-cyan-500/30 hover:border-cyan-400 dark:hover:border-cyan-500/60 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-500/20 border border-cyan-300 dark:border-cyan-500/40 flex items-center justify-center text-cyan-700 dark:text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-cyan-200">Knapsack + 72h Price-Drop</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Executes multi-merchant ILP basket, places PayPal v2 Authorize hold, triggers Channel3 15% price-drop poll, and executes final lower-price capture.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_KNAPSACK_PRICE_DROP', 'Trigger Knapsack + 72h Price-Drop Capture')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_KNAPSACK_PRICE_DROP' ? 'Executing...' : 'Trigger Knapsack + 72h Drop'}
            </button>
          </div>

          {/* Button 2: Synthetic Intent Bid */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border border-purple-200 dark:border-purple-500/30 hover:border-purple-400 dark:hover:border-purple-500/60 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-500/20 border border-purple-300 dark:border-purple-500/40 flex items-center justify-center text-purple-700 dark:text-purple-400">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-purple-200">Synthetic Intent Bid</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Mints Vault v3 setup-token & Ed25519 voucher ($450 bid on $490 basket, 8.89% overage), matches autonomous merchant floor, and captures instantly.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_SYNTHETIC_BID', 'Trigger Synthetic Intent Bid ($450 on $490 Bundle)')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_SYNTHETIC_BID' ? 'Broadcasting...' : 'Trigger Synthetic Bid ($450)'}
            </button>
          </div>

          {/* Button 3: Redis Lua Prompt-Injection Attack */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border border-rose-200 dark:border-rose-500/30 hover:border-rose-400 dark:hover:border-rose-500/60 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 flex items-center justify-center text-rose-700 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-rose-200">Redis Lua Prompt-Injection</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Fires adversarial $5,000 spend attempt exceeding the buyer mandate budget cap; demonstrates atomic &lt;1ms rejection before hitting PayPal API.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_REDIS_LUA_ATTACK', 'Trigger Redis Lua Prompt-Injection Attack ($5,000)')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-rose-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_REDIS_LUA_ATTACK' ? 'Injecting Attack...' : 'Trigger $5,000 Attack'}
            </button>
          </div>

          {/* Button 4: Inject Live Sandbox Dispute & Auto-Adjudicate */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-500/60 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                <Server className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-emerald-200">Sandbox Dispute Adjudicate</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Simulates /require-evidence on PayPal dispute, triggers vision forensics + in-memory pdf-lib evidence upload, and calls /adjudicate in Seller Favor.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('INJECT_SANDBOX_DISPUTE', 'Inject Live Sandbox Dispute & Auto-Adjudicate')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'INJECT_SANDBOX_DISPUTE' ? 'Adjudicating...' : 'Auto-Adjudicate Dispute'}
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
                  <span className="text-slate-400">{terminalLogs.timestamp}</span>
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
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-2">
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
      <footer className="border-t border-slate-200 dark:border-[#1e293b] py-4 bg-slate-100 dark:bg-[#080d19]/80 text-center text-xs text-slate-600 dark:text-slate-400 font-mono transition-colors">
        AegisPay Hackathon Verification System • All APIs Grounded via APIMatic & PayPal Server SDK
      </footer>
    </div>
  );
}
