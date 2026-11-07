'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  Play,
  Loader2,
  RotateCcw,
  Terminal,
  Zap,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { FriendlyErrorTransmuter } from './common/FriendlyErrorTransmuter';

export interface ChaosAction {
  id: string;
  title: string;
  track: string;
  description: string;
  expectedOutcome: string;
}

const CHAOS_ACTIONS: ChaosAction[] = [
  {
    id: 'TRIGGER_REDIS_LUA_ATTACK',
    title: 'Atomic Lua Budget Attack ($5,000 Overspend)',
    track: 'Custodian Security Gate',
    description: 'Simulates autonomous agent overspending $5,000 against a $500 session cap.',
    expectedOutcome: 'Sub-millisecond rejection via Redis Lua atomic enforcer with zero PayPal touch.',
  },
  {
    id: 'TRIGGER_SYNTHETIC_BID',
    title: 'Vault v3 Synthetic Intent Bid Clearing',
    track: 'PayPal Vault v3',
    description: 'Autonomous counter-bid match against seller floor price with Vault setup token.',
    expectedOutcome: 'Vault v3 setup token converted to payment token, cleared & captured at $450.',
  },
  {
    id: 'INJECT_SANDBOX_DISPUTE',
    title: 'Vision Forensics & EXIF Tamper Defense',
    track: 'Disputes & Forensics',
    description: 'Injects buyer chargeback with modified EXIF photo and cosmetic defect.',
    expectedOutcome: 'Flagged EXIF software tamper, generated PDF defense dossier, seller favor.',
  },
  {
    id: 'TRIGGER_KNAPSACK_PRICE_DROP',
    title: 'Knapsack Multi-Merchant 72h Price Drop',
    track: 'Deterministic Scoring & Knapsack',
    description: 'Solves multi-merchant basket, places v2 auth hold, simulates 15% price drop.',
    expectedOutcome: 'Waived shipping, captured hold at $403.75 lower price with 72h protection.',
  },
];

export function ChaosSimulator() {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionMs, setExecutionMs] = useState<number | null>(null);

  const handleRunChaos = async (actionId: string) => {
    setActiveAction(actionId);
    setLoadingAction(actionId);
    setError(null);
    const startTime = performance.now();
    try {
      const res = await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Chaos simulation failed`);
      }
      setResult(data);
      setExecutionMs(Math.round(performance.now() - startTime));
    } catch (err: any) {
      setError(err.message || 'Failed to trigger chaos fault injection');
      setExecutionMs(Math.round(performance.now() - startTime));
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHAOS_ACTIONS.map((action) => (
          <div
            key={action.id}
            className={`p-5 rounded-2xl border transition-all ${
              activeAction === action.id
                ? 'border-cyan-500/80 bg-cyan-950/20 shadow-lg shadow-cyan-500/10'
                : 'border-slate-800 bg-[#0c1424]/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30">
                {action.track}
              </span>
              <button
                onClick={() => handleRunChaos(action.id)}
                disabled={loadingAction !== null}
                className={`px-3 py-1.5 rounded-xl font-semibold text-xs tracking-wide flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 ${
                  loadingAction === action.id
                    ? 'bg-amber-600 text-white shadow-amber-500/20'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {loadingAction === action.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{loadingAction === action.id ? 'Simulating...' : 'Inject Fault'}</span>
              </button>
            </div>

            <h4 className="text-sm font-bold text-white mt-1">{action.title}</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{action.description}</p>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>Expected: {action.expectedOutcome}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Telemetry Output Console */}
      <div className="rounded-2xl border border-slate-800 bg-[#060b14] p-5 font-mono text-xs shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white">Chaos Telemetry & Readback Stream</span>
          </div>
          {loadingAction ? (
            <div className="flex items-center gap-2 text-cyan-400 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Simulating clearinghouse reaction for {loadingAction}...</span>
            </div>
          ) : executionMs !== null ? (
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Round-trip latency: {executionMs}ms</span>
            </div>
          ) : null}
        </div>

        {error && (
          <div className="mt-4">
            <FriendlyErrorTransmuter error={error} />
          </div>
        )}

        {result ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Action Resolved: {result.chaos_action} ({result.status})</span>
            </div>
            <pre className="p-4 rounded-xl bg-[#030712] border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-600">
            Select any chaos trigger above to test live system resilience, atomic rollback, or dispute defenses.
          </div>
        )}
      </div>
    </div>
  );
}
