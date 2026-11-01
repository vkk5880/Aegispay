'use client';

import React, { useState, useEffect } from 'react';
import '@bryntum/scheduler-trial/scheduler.css';

// We're wrapping a basic timeline view to demonstrate the "Unallocated SLA Deadline" concept
export function DisputeSlaScheduler() {
  const [unallocatedCount, setUnallocatedCount] = useState(3);

  // In a real Bryntum integration, this would mount the Scheduler instance using its API
  // and subscribe to store changes to compute the unallocated count.

  return (
    <div className="flex flex-col h-[400px] border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-800">Analyst SLA Schedule</h2>

        {unallocatedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-md border border-red-200 animate-pulse font-medium text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            {unallocatedCount} Unallocated SLA Deadline{unallocatedCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Bryntum Scheduler Container Placeholder */}
      <div className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0iI2ZmZmZmZiIvPgo8cGF0aCBkPSJNMCAwaDQwdjQwaC00MHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2YwZjBmMCIgc3Ryb2tlLXdpZHRoPSIxIi8+Cjwvc3ZnPg==')] relative">
        <div className="absolute top-4 left-4 p-4 bg-white/90 rounded border shadow-sm text-sm text-slate-600 max-w-md">
          <p className="font-semibold mb-2 text-slate-800">Bryntum Scheduler Trial Instance Mounted</p>
          <p>
            The interactive timeline auto-schedules analyst shifts before <code>seller_response_due_date</code> expires. Any dispute missing an assignment triggers the red SLA badge above.
          </p>
        </div>

        {/* Dummy timeline bars for visual reference */}
        <div className="absolute top-24 left-[20%] w-[15%] h-8 bg-blue-500 rounded text-xs text-white flex items-center px-2 shadow">
          PP-D-1002 (Review)
        </div>
        <div className="absolute top-36 left-[30%] w-[25%] h-8 bg-blue-500 rounded text-xs text-white flex items-center px-2 shadow">
          PP-D-1003 (Compromise)
        </div>
        <div className="absolute top-[200px] left-[5%] w-[12%] h-8 bg-red-500 rounded border-2 border-red-700 text-xs text-white flex items-center px-2 shadow z-10 font-bold">
          PP-D-1004 (UNALLOCATED!)
        </div>
      </div>
    </div>
  );
}
