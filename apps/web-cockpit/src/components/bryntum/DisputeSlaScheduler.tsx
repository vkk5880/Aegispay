'use client';

import React, { useState } from 'react';
import '@bryntum/scheduler-trial/scheduler.css';

export function DisputeSlaScheduler() {
  const [unallocatedCount] = useState(3);

  return (
    <div className="flex flex-col h-[400px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0c1424] shadow-xs transition-colors">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080d19]">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>Bryntum Analyst SLA Schedule</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30">
            Scheduler 7.3
          </span>
        </h2>

        {unallocatedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-400 rounded-lg border border-rose-300 dark:border-rose-500/40 animate-pulse font-medium text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            {unallocatedCount} Unallocated SLA Deadline{unallocatedCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Bryntum Scheduler Container Placeholder */}
      <div className="flex-1 bg-slate-50 dark:bg-[#080d19] relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-20 dark:opacity-10 bg-[radial-gradient(#64748b_1px,transparent_1px)] [background-size:16px_16px]" />

        <div className="absolute top-4 left-4 p-4 bg-white/95 dark:bg-[#0f172a]/95 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-xs text-slate-700 dark:text-slate-300 max-w-md backdrop-blur-sm z-20">
          <p className="font-bold mb-1.5 text-slate-900 dark:text-white">Bryntum Scheduler Trial Instance Mounted</p>
          <p className="leading-relaxed">
            The interactive timeline auto-schedules merchant analyst shifts before <code>seller_response_due_date</code> expires. Any dispute missing an assignment triggers the red SLA badge above.
          </p>
        </div>

        {/* Dummy timeline bars for visual reference */}
        <div className="absolute top-28 left-[20%] w-[20%] h-8 bg-blue-600 rounded-lg text-xs text-white flex items-center px-3 shadow-md font-mono font-medium">
          PP-D-1002 (In Review)
        </div>
        <div className="absolute top-40 left-[35%] w-[28%] h-8 bg-cyan-600 rounded-lg text-xs text-white flex items-center px-3 shadow-md font-mono font-medium">
          PP-D-1003 (Compromise Offer)
        </div>
        <div className="absolute top-52 left-[8%] w-[16%] h-8 bg-rose-600 rounded-lg border-2 border-rose-400 text-xs text-white flex items-center px-3 shadow-md z-10 font-mono font-bold">
          PP-D-1004 (UNALLOCATED!)
        </div>
      </div>
    </div>
  );
}
