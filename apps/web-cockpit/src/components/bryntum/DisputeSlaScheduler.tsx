'use client';

import React, { useState } from 'react';
import '@bryntum/scheduler-trial/scheduler.css';
import { Clock, Filter, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface SlaDisputeItem {
  id: string;
  disputeId: string;
  amountCents: number;
  reason: string;
  remainingHours: number;
  status: 'UNALLOCATED_URGENT' | 'VISION_TRIAGE' | 'SUBMITTED' | 'RESOLVED';
  analyst?: string;
  leftPercent: number;
  widthPercent: number;
  dueDate: string;
}

const INITIAL_DISPUTES: SlaDisputeItem[] = [
  {
    id: 'sla-1',
    disputeId: 'PP-D-1004',
    amountCents: 14500,
    reason: 'Defective / Damaged',
    remainingHours: 4.5,
    status: 'UNALLOCATED_URGENT',
    leftPercent: 8,
    widthPercent: 18,
    dueDate: 'In 4.5 hrs',
  },
  {
    id: 'sla-2',
    disputeId: 'PP-D-1005',
    amountCents: 21000,
    reason: 'Unauthorized Claim',
    remainingHours: 9.0,
    status: 'UNALLOCATED_URGENT',
    leftPercent: 15,
    widthPercent: 22,
    dueDate: 'In 9.0 hrs',
  },
  {
    id: 'sla-3',
    disputeId: 'PP-D-1002',
    amountCents: 4999,
    reason: 'Damaged Surface',
    remainingHours: 18.0,
    status: 'VISION_TRIAGE',
    analyst: 'AI Arbiter / Vision Task',
    leftPercent: 28,
    widthPercent: 24,
    dueDate: 'In 18.0 hrs',
  },
  {
    id: 'sla-4',
    disputeId: 'PP-D-1003',
    amountCents: 8500,
    reason: 'Significantly Not as Described',
    remainingHours: 32.5,
    status: 'SUBMITTED',
    analyst: 'Sarah J. (Lead Analyst)',
    leftPercent: 45,
    widthPercent: 30,
    dueDate: 'In 32.5 hrs',
  },
  {
    id: 'sla-5',
    disputeId: 'PP-D-1006',
    amountCents: 12000,
    reason: 'Item Not Received',
    remainingHours: 54.0,
    status: 'SUBMITTED',
    analyst: 'David M. (Risk Ops)',
    leftPercent: 62,
    widthPercent: 28,
    dueDate: 'In 54.0 hrs',
  },
];

export function DisputeSlaScheduler() {
  const [disputes] = useState<SlaDisputeItem[]>(INITIAL_DISPUTES);
  const [filterImminentBreach, setFilterImminentBreach] = useState(false);

  // Filter disputes if "Imminent Breach (< 12h)" toggle is active
  const displayedDisputes = filterImminentBreach
    ? disputes.filter((d) => d.remainingHours < 12)
    : disputes;

  const unallocatedCount = disputes.filter(
    (d) => d.status === 'UNALLOCATED_URGENT' || !d.analyst
  ).length;

  const imminentCount = disputes.filter((d) => d.remainingHours < 12).length;

  return (
    <div
      data-testid="dispute-sla-scheduler"
      className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0c1424] shadow-xs transition-colors"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080d19]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Bryntum Analyst SLA Schedule</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30">
              Scheduler 7.3
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* 1-Click "Imminent Breach (< 12h)" Filter Toggle */}
          <button
            type="button"
            data-testid="filter-imminent-breach-btn"
            onClick={() => setFilterImminentBreach(!filterImminentBreach)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              filterImminentBreach
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Imminent Breach (&lt; 12h)</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                filterImminentBreach
                  ? 'bg-rose-800 text-rose-100'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {imminentCount}
            </span>
          </button>

          {unallocatedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400 rounded-lg border border-rose-300 dark:border-rose-500/40 animate-pulse font-medium text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{unallocatedCount} Unallocated</span>
            </div>
          )}
        </div>
      </div>

      {/* SLA Legend Bar */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-slate-100/60 dark:bg-[#070b14] border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Urgency Key:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-rose-600" />
          <span>Red: Imminent (&lt; 6h) / Unallocated</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600" />
          <span>Yellow: Under Vision Triage</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600" />
          <span>Green: Evidence Bundle Submitted</span>
        </div>
      </div>

      {/* Bryntum Scheduler Container / Visual Timeline */}
      <div className="bg-slate-50 dark:bg-[#080d19] relative min-h-[300px] p-4 space-y-3">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-20 dark:opacity-10 bg-[radial-gradient(#64748b_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Informational header banner */}
        <div className="relative z-10 flex items-center justify-between bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>
              Real-time timeline tracking <code>seller_response_due_date</code> deadlines across active disputes.
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            Showing {displayedDisputes.length} of {disputes.length}
          </span>
        </div>

        {/* Timeline Items Track */}
        <div className="relative z-10 space-y-2.5 pt-2">
          {displayedDisputes.map((item) => {
            // Determine urgency bar styling
            let barColor = 'bg-slate-600 border-slate-500 text-white';
            let statusLabel = 'In Review';
            let StatusIcon = ShieldCheck;

            if (item.remainingHours < 6 || item.status === 'UNALLOCATED_URGENT') {
              barColor = 'bg-rose-600 border-rose-400 text-white shadow-rose-900/40 animate-pulse';
              statusLabel = `CRITICAL (< ${item.remainingHours}h) - Unallocated`;
              StatusIcon = AlertTriangle;
            } else if (item.status === 'VISION_TRIAGE') {
              barColor = 'bg-amber-500 border-amber-300 text-slate-900 font-semibold shadow-amber-900/30';
              statusLabel = 'Under Vision Triage';
              StatusIcon = ShieldCheck;
            } else if (item.status === 'SUBMITTED') {
              barColor = 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-900/30';
              statusLabel = 'Evidence Submitted';
              StatusIcon = CheckCircle2;
            }

            return (
              <div
                key={item.id}
                data-testid={`sla-row-${item.disputeId.toLowerCase()}`}
                className="bg-white/80 dark:bg-[#0c1424]/80 border border-slate-200 dark:border-slate-800 rounded-lg p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-[200px]">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {item.disputeId}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    ${(item.amountCents / 100).toFixed(2)}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-[130px]">
                    {item.reason}
                  </span>
                </div>

                {/* Timeline Bar representation */}
                <div className="flex-1 max-w-md bg-slate-100 dark:bg-slate-900/80 rounded-md h-7 relative overflow-hidden flex items-center px-1">
                  <div
                    className={`h-5 rounded border px-2 flex items-center justify-between text-[10px] font-mono shadow-xs transition-all ${barColor}`}
                    style={{
                      marginLeft: `${item.leftPercent}%`,
                      width: `${item.widthPercent}%`,
                      minWidth: '120px',
                    }}
                  >
                    <span className="truncate flex items-center gap-1">
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      {statusLabel}
                    </span>
                    <span className="shrink-0 font-bold ml-1">{item.dueDate}</span>
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-slate-500 shrink-0">
                  {item.analyst ? item.analyst : <span className="text-rose-500 font-bold">Unassigned</span>}
                </div>
              </div>
            );
          })}

          {displayedDisputes.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs italic">
              No disputes matching the active filter criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
