'use client';

import React, { useState, useEffect } from 'react';
import { webLogger as logger } from '@/lib/logger';
import { Cpu, CheckCircle2, Clock, Sparkles, ChevronRight, Play, RotateCcw } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

export interface ThoughtStep {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  badge?: string;
  badgeColor?: 'cyan' | 'blue' | 'emerald' | 'purple' | 'amber';
}

interface ThoughtStreamVisualizerProps {
  isRunning?: boolean;
  onComplete?: () => void;
  customSteps?: ThoughtStep[];
}

const DEFAULT_MILESTONES: Omit<ThoughtStep, 'status'>[] = [
  {
    id: 'step_1',
    timestamp: '0.12s',
    title: 'Visual Inspiration & Color Parsing',
    detail: 'Ingested natural language prompt and visual cues: parsed walnut wood and acoustic design palette.',
    badge: 'Channel3 Multi-Modal',
    badgeColor: 'purple',
  },
  {
    id: 'step_2',
    timestamp: '0.34s',
    title: 'Channel3 Vector Search Candidate Matching',
    detail: 'Matched 14 candidate offers across 3 merchants via Channel3 catalog with 2PC stock verification.',
    badge: '14 Offers / 3 Merchants',
    badgeColor: 'blue',
  },
  {
    id: 'step_3',
    timestamp: '0.61s',
    title: 'Commission-Subsidized Knapsack Solver',
    detail: 'Solved multi-vendor knapsack: saved $24.50 by bundling shipping thresholds and pass-back rebates.',
    badge: 'Saved $24.50',
    badgeColor: 'emerald',
  },
  {
    id: 'step_4',
    timestamp: '0.82s',
    title: 'WebCrypto Cryptographic Mandate Lock',
    detail: 'WebCrypto Ed25519 spend mandate locked: $400.00 cap anchored by hardware-secured signature.',
    badge: 'Ed25519 Verified',
    badgeColor: 'cyan',
  },
];

const USER_FRIENDLY_MILESTONES: Omit<ThoughtStep, 'status'>[] = [
  {
    id: 'step_1',
    timestamp: '0.12s',
    title: 'Understanding Shopping Intent',
    detail: 'Analyzed your preferences, style requirements, and design specifications.',
    badge: 'Preferences Matched',
    badgeColor: 'purple',
  },
  {
    id: 'step_2',
    timestamp: '0.34s',
    title: 'Searching Verified Store Catalogs',
    detail: 'Checked 14 offers across 3 trusted stores and confirmed live stock availability.',
    badge: '14 Offers / 3 Stores',
    badgeColor: 'blue',
  },
  {
    id: 'step_3',
    timestamp: '0.61s',
    title: 'Maximizing Savings & Free Shipping',
    detail: 'Combined store shipments to unlock free delivery and instant cashback savings ($24.50 saved).',
    badge: 'Saved $24.50',
    badgeColor: 'emerald',
  },
  {
    id: 'step_4',
    timestamp: '0.82s',
    title: 'Budget & Security Confirmed',
    detail: 'Verified total order stays within your approved limit with PayPal purchase protection.',
    badge: 'Protected',
    badgeColor: 'cyan',
  },
];

export function ThoughtStreamVisualizer({
  isRunning = false,
  onComplete,
  customSteps,
}: ThoughtStreamVisualizerProps) {
  const { showTechnicalDetails } = useUiMode();
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const activeMilestones = showTechnicalDetails ? DEFAULT_MILESTONES : USER_FRIENDLY_MILESTONES;

  const initialSteps: ThoughtStep[] = (customSteps || activeMilestones).map((step, idx) => ({
    ...step,
    status: idx === 0 ? 'COMPLETED' : idx === 1 ? 'ACTIVE' : 'PENDING',
  }));

  const [steps, setSteps] = useState<ThoughtStep[]>(initialSteps);

  useEffect(() => {
    if (!customSteps) {
      const milestones = showTechnicalDetails ? DEFAULT_MILESTONES : USER_FRIENDLY_MILESTONES;
      logger.debug('[ThoughtStream:Milestones] Updating active milestones based on UI mode', {
        showTechnicalDetails,
        stepCount: milestones.length,
      });
      setSteps(
        milestones.map((step, idx) => ({
          ...step,
          status: idx === 0 ? 'COMPLETED' : idx === 1 ? 'ACTIVE' : 'PENDING',
        }))
      );
    }
  }, [showTechnicalDetails, customSteps]);

  const runSimulation = () => {
    logger.info('[ThoughtStream:Simulation] Starting reasoning chain simulation', {
      showTechnicalDetails,
      totalSteps: (customSteps || activeMilestones).length,
    });
    setIsExecuting(true);
    setActiveStepIndex(0);

    const resetSteps = (customSteps || activeMilestones).map((step, idx) => ({
      ...step,
      status: (idx === 0 ? 'ACTIVE' : 'PENDING') as ThoughtStep['status'],
    }));
    setSteps(resetSteps);

    const stepDelays = [400, 900, 1400, 1900];

    stepDelays.forEach((delay, index) => {
      setTimeout(() => {
        logger.debug('[ThoughtStream:StepTransition] DAG node transition executed', {
          stepIndex: index,
          delayMs: delay,
          activeStepId: (customSteps || activeMilestones)[index]?.id,
          activeStepTitle: (customSteps || activeMilestones)[index]?.title,
        });

        setSteps((prev) =>
          prev.map((step, idx) => {
            if (idx < index) return { ...step, status: 'COMPLETED' };
            if (idx === index) return { ...step, status: 'ACTIVE' };
            return { ...step, status: 'PENDING' };
          })
        );
        setActiveStepIndex(index);

        if (index === stepDelays.length - 1) {
          setTimeout(() => {
            logger.info('[ThoughtStream:Complete] All thought stream reasoning steps completed', {
              totalCompleted: stepDelays.length,
            });
            setSteps((prev) => prev.map((s) => ({ ...s, status: 'COMPLETED' })));
            setIsExecuting(false);
            if (onComplete) {
              logger.debug('[ThoughtStream:Callback] Invoking onComplete callback');
              onComplete();
            }
          }, 600);
        }
      }, delay);
    });
  };

  useEffect(() => {
    if (isRunning) {
      logger.info('[ThoughtStream:Trigger] isRunning prop triggered reasoning trace simulation');
      runSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Background glow */}
      <div className="absolute -bottom-20 -right-20 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1e293b] gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-500/30 rounded-xl text-blue-700 dark:text-blue-400 shadow-xs">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              {showTechnicalDetails ? 'Streaming Agent Reasoning Trace' : 'Shopping Assistant Live Steps'}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-500" />
                {showTechnicalDetails ? 'Live Execution' : 'Active'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {showTechnicalDetails
                ? 'Autonomous cognitive trace of multi-merchant discovery, knapsack ILP solver, and cryptographic vault gating'
                : 'Live steps showing product discovery, price optimization, and purchase protection.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runSimulation}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isExecuting ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                <span>{showTechnicalDetails ? 'Tracing...' : 'Checking...'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>{showTechnicalDetails ? 'Re-run Trace' : 'Replay Steps'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step by step timeline */}
      <div className="mt-6 space-y-3 font-mono">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'COMPLETED';
          const isActive = step.status === 'ACTIVE';

          let badgeClasses = 'bg-cyan-100 dark:bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/30';
          if (step.badgeColor === 'emerald') {
            badgeClasses = 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30';
          } else if (step.badgeColor === 'blue') {
            badgeClasses = 'bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-500/30';
          } else if (step.badgeColor === 'purple') {
            badgeClasses = 'bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-500/30';
          }

          return (
            <div
              key={step.id}
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                isActive
                  ? 'bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-400 dark:border-cyan-500/50 shadow-sm'
                  : isCompleted
                  ? 'bg-slate-50 dark:bg-[#070d18] border-slate-200 dark:border-slate-800/80 opacity-95'
                  : 'bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/50 dark:border-slate-800/40 opacity-50'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center gap-2.5">
                  {/* Status Indicator */}
                  {isCompleted ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : isActive ? (
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-cyan-600 dark:text-cyan-400 flex-shrink-0 animate-spin">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <span className="text-[10px]">{idx + 1}</span>
                    </div>
                  )}

                  <span className="text-xs font-bold text-slate-500 dark:text-cyan-400/80">
                    [{step.timestamp}]
                  </span>

                  <span className="text-xs font-semibold font-sans text-slate-900 dark:text-slate-100">
                    {step.title}
                  </span>
                </div>

                {step.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-md border font-mono font-medium self-start sm:self-center ${badgeClasses}`}>
                    {step.badge}
                  </span>
                )}
              </div>

              {/* Detail Text */}
              <div className="mt-1.5 pl-7 text-[11px] font-sans text-slate-600 dark:text-slate-400 leading-relaxed">
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
