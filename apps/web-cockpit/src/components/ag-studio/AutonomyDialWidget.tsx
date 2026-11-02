'use client';

import React, { useState } from 'react';
import { Sliders, ShieldCheck, ShieldAlert, Zap, Info } from 'lucide-react';
import { AutonomyDialMode } from '@aegispay/shared-types';

export interface AutonomyDialWidgetProps {
  initialMode?: AutonomyDialMode;
  onChange?: (mode: AutonomyDialMode) => void;
  className?: string;
}

interface DialOption {
  mode: AutonomyDialMode;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  policySummary: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODES: DialOption[] = [
  {
    mode: 'COPILOT',
    title: 'Co-Pilot',
    badge: '100% Supervised',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    description: 'Human approval required for all actions.',
    policySummary: 'Full human-in-the-loop: Every refund, offer, and defense submission requires explicit analyst sign-off.',
    icon: ShieldAlert,
  },
  {
    mode: 'SUPERVISED',
    title: 'Supervised',
    badge: '< $50 Micro-Refunds',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    description: 'Auto-executes micro-refunds < $50; analyst confirmation for > $50.',
    policySummary: 'Balanced guardrail: Micro-claims below $50 are auto-settled to avoid arbitration fees; higher claims require review.',
    icon: ShieldCheck,
  },
  {
    mode: 'AUTONOMOUS',
    title: 'Full Autonomous',
    badge: 'Zero-Click Execution',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    description: 'Executes all verified forensic verdicts within policy.',
    policySummary: 'Unattended clearing: System automatically executes Tier 1–4 actions according to mathematical (L, R) liability matrix.',
    icon: Zap,
  },
];

export function AutonomyDialWidget({
  initialMode = 'SUPERVISED',
  onChange,
  className = '',
}: AutonomyDialWidgetProps) {
  const [selectedMode, setSelectedMode] = useState<AutonomyDialMode>(initialMode);

  const handleModeChange = (mode: AutonomyDialMode) => {
    setSelectedMode(mode);
    if (onChange) {
      onChange(mode);
    }
  };

  const currentOption = MODES.find((m) => m.mode === selectedMode) || MODES[1];

  return (
    <div
      data-testid="autonomy-dial-widget"
      className={`border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-[#0b1324] shadow-xs ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              Merchant Autonomy Dial
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Control automated arbitration execution vs. human analyst approval
            </p>
          </div>
        </div>

        <span
          className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${currentOption.badgeColor}`}
        >
          {currentOption.badge}
        </span>
      </div>

      {/* 3-Mode Slider / Switch Buttons */}
      <div className="grid grid-cols-3 gap-2 mt-3 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800">
        {MODES.map((option) => {
          const isSelected = option.mode === selectedMode;
          const Icon = option.icon;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => handleModeChange(option.mode)}
              data-testid={`autonomy-mode-${option.mode.toLowerCase()}`}
              className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg text-center transition-all ${
                isSelected
                  ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-300 dark:ring-slate-700 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon
                className={`w-4 h-4 mb-1 ${
                  isSelected
                    ? option.mode === 'AUTONOMOUS'
                      ? 'text-emerald-500'
                      : option.mode === 'SUPERVISED'
                      ? 'text-amber-500'
                      : 'text-blue-500'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span className="text-xs font-semibold leading-tight">{option.title}</span>
            </button>
          );
        })}
      </div>

      {/* Description & Policy Insight */}
      <div className="mt-3 bg-slate-50 dark:bg-[#080d19] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-xs">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              {currentOption.description}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {currentOption.policySummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
