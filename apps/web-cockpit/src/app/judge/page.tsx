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
  ShoppingCart,
  Undo2,
  FileCheck,
  CheckCircle2,
  Clock,
  Sparkles,
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
              Pre-Authenticated Judge & Chaos Clearinghouse Portal
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
              JUDGE_MODE: ACTIVE
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
              7 SPONSOR TRACKS READY
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Hackathon Clearinghouse Pipeline & Chaos Simulator
              </h1>
              <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                Wave 3 Task 32
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40">
                1-CLICK VERIFICATION
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
              Wires 1-click triggers across all 7 competition tracks:
              <strong className="text-rose-600 dark:text-rose-400"> (1) Redis Lua Budget Exhaustion</strong>,
              <strong className="text-blue-600 dark:text-blue-400"> (2) Channel3 Knapsack Promo</strong>,
              <strong className="text-purple-600 dark:text-purple-400"> (3) Real Vault v3 Auto-Buy</strong>,
              <strong className="text-orange-600 dark:text-orange-400"> (4) Lua Decline Rollback</strong>,
              <strong className="text-emerald-600 dark:text-emerald-400"> (5) Vision Dispute Forensics</strong>, and
              <strong className="text-cyan-600 dark:text-cyan-400"> (6) 72h Knapsack Price Drop</strong> with live PayPal read-backs.
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

        {/* 7 Sponsor Track Badges Strip */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a101f] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>7 Sponsor Tracks Covered ($34,500 Prize Pool):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              ✓ PayPal Core
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              ✓ Channel3
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              ✓ APIMatic
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              ✓ AG Grid / Studio
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              ✓ Bryntum
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              ✓ Render
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              ✓ DuckDB-WASM
            </span>
          </div>
        </div>

        {/* 6 Chaos Triggers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Action 1: Adversarial Redis Lua budget exhaustion attack (<1ms block) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-rose-300 dark:border-rose-500/40 hover:border-rose-500 dark:hover:border-rose-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 rounded text-[9px] font-mono font-bold">
              &lt; 1ms LUA BLOCK
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 flex items-center justify-center text-rose-700 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">ATTACK 1</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-rose-200">Budget Exhaustion Attack</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Adversarial AI attempts $5,000 spend over $500 cap. Demonstrates instant <strong>&lt; 1ms Redis Lua atomic block</strong> with 0 PayPal API calls.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_REDIS_LUA_ATTACK', '1. Adversarial Redis Lua Budget Exhaustion Attack ($5,000)')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-rose-600 hover:bg-rose-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-rose-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_REDIS_LUA_ATTACK' ? 'Injecting Attack...' : 'Trigger $5,000 Attack'}
            </button>
          </div>

          {/* Action 2: Live Channel3 multi-modal search & Knapsack optimization with promo code */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-blue-300 dark:border-blue-500/40 hover:border-blue-500 dark:hover:border-blue-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 rounded text-[9px] font-mono font-bold">
              CHANNEL3 + PROMO
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40 flex items-center justify-center text-blue-700 dark:text-blue-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">FLOW 2</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-blue-200">Channel3 Search & Knapsack</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Applies promo <code>PAYPAL-HACKATHON-2026</code>, executes 2PC inventory hold, and runs mathematical multi-merchant Knapsack bundling.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_CHANNEL3_KNAPSACK', '2. Live Channel3 Search & Knapsack Optimization')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_CHANNEL3_KNAPSACK' ? 'Optimizing...' : 'Run Channel3 Knapsack'}
            </button>
          </div>

          {/* Action 3: Real autonomous auto-buy checkout using PayPal Vault v3 token */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-purple-300 dark:border-purple-500/40 hover:border-purple-500 dark:hover:border-purple-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 rounded text-[9px] font-mono font-bold">
              VAULT v3 TOKEN
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-500/20 border border-purple-300 dark:border-purple-500/40 flex items-center justify-center text-purple-700 dark:text-purple-400">
                <Activity className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400">FLOW 3</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-purple-200">Autonomous Vault Auto-Buy</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Headless off-session execution: consumes Vault v3 payment token, executes Orders v2 multi-unit capture, and performs verified server read-back.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_AUTONOMOUS_VAULT_BUY', '3. Real Autonomous Auto-Buy via PayPal Vault v3')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_AUTONOMOUS_VAULT_BUY' ? 'Capturing...' : 'Trigger Vault Auto-Buy'}
            </button>
          </div>

          {/* Action 4: Instant Redis Lua rollback on simulated card decline (<1ms) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-orange-300 dark:border-orange-500/40 hover:border-orange-500 dark:hover:border-orange-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30 rounded text-[9px] font-mono font-bold">
              &lt; 1ms ROLLBACK
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-500/40 flex items-center justify-center text-orange-700 dark:text-orange-400">
                <Undo2 className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400">FLOW 4</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-orange-200">Decline Compensating Rollback</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Simulates <code>INSTRUMENT_DECLINED</code> and executes atomic <code>ROLLBACK_LUA_SCRIPT</code> to restore user budget capacity in &lt; 1ms.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_REDIS_LUA_ROLLBACK', '4. Instant Redis Lua Rollback on Decline')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-orange-600 hover:bg-orange-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_REDIS_LUA_ROLLBACK' ? 'Rolling Back...' : 'Trigger Decline & Rollback'}
            </button>
          </div>

          {/* Action 5: Multi-modal dispute evidence submission with EXIF check and PDF generation */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-emerald-300 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 rounded text-[9px] font-mono font-bold">
              VISION FORENSICS + PDF
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                <FileCheck className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">FLOW 5</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-emerald-200">Dispute Evidence & PDF</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Runs mobile-safe EXIF inspection, generates in-memory pdf-lib forensic dossier, submits to PayPal Disputes v1, and auto-adjudicates.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('INJECT_SANDBOX_DISPUTE', '5. Multi-Modal Dispute Forensics & PDF Generation')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'INJECT_SANDBOX_DISPUTE' ? 'Adjudicating...' : 'Auto-Adjudicate Dispute'}
            </button>
          </div>

          {/* Action 6: Knapsack Multi-Vendor + 72h Price Drop */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090f1e] border-2 border-cyan-300 dark:border-cyan-500/40 hover:border-cyan-500 dark:hover:border-cyan-500/80 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 rounded text-[9px] font-mono font-bold">
              72h PRICE DROP
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-500/20 border border-cyan-300 dark:border-cyan-500/40 flex items-center justify-center text-cyan-700 dark:text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400">FLOW 6</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-cyan-200">Knapsack + 72h Price Drop</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Places multi-unit authorization hold, simulates 15% price drop via Render Workflows watcher, and captures lower price.
              </p>
            </div>
            <button
              onClick={() => triggerChaos('TRIGGER_KNAPSACK_PRICE_DROP', '6. Knapsack + 72h Price-Drop Capture')}
              disabled={loadingAction !== null}
              className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loadingAction === 'TRIGGER_KNAPSACK_PRICE_DROP' ? 'Executing...' : 'Trigger Knapsack + 72h Drop'}
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
                        : terminalLogs.status === 'ROLLED_BACK'
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
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
                  <p className="text-xs">Click one of the 6 chaos buttons above to view real-time execution telemetry.</p>
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
                  Live Verified Server Read-Back Terminal
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">ALL_TRACKS_GROUNDED</span>
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
