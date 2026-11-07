'use client';

import React from 'react';
import { ChaosSimulator } from '@/components/chaos-simulator';
import { LayoutShell } from '@/components/common/LayoutShell';
import { ShieldAlert, Zap, Cpu } from 'lucide-react';

export default function SimulatorPage() {
  return (
    <LayoutShell>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-950/60 border border-cyan-500/30 rounded-2xl text-cyan-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Chaos Simulator & Fault Injection Portal
              </h1>
              <p className="text-xs text-slate-400">
                Interactive resilience testing for prompt injections, overspend attacks, stockouts, card declines, and 3DS gates.
              </p>
            </div>
          </div>
        </div>

        <ChaosSimulator />
      </div>
    </LayoutShell>
  );
}
