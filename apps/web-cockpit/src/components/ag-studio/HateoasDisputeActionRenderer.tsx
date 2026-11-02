'use client';

import React, { useState } from 'react';

interface HateoasDisputeActionRendererProps {
  hateoasAllowedActions: string[];
  disputeId: string;
}

export function HateoasDisputeActionRenderer({ hateoasAllowedActions, disputeId }: HateoasDisputeActionRendererProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [executedAction, setExecutedAction] = useState<string | null>(null);

  const handleActionClick = async (action: string) => {
    setLoadingAction(action);
    setTimeout(() => {
      setLoadingAction(null);
      setExecutedAction(action);
    }, 800);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {hateoasAllowedActions.includes('provide-evidence') && (
        <button
          className="px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 transition-all shadow-xs"
          onClick={() => handleActionClick('provide-evidence')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'provide-evidence'
            ? 'Submitting...'
            : executedAction === 'provide-evidence'
            ? '✓ Defense PDF Submitted'
            : 'Submit PDF Defense'}
        </button>
      )}
      {hateoasAllowedActions.includes('make-offer') && (
        <button
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-all shadow-xs"
          onClick={() => handleActionClick('make-offer')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'make-offer'
            ? 'Dispatching...'
            : executedAction === 'make-offer'
            ? '✓ 35% Offer Dispatched'
            : 'Offer 35% Settlement'}
        </button>
      )}
      {hateoasAllowedActions.includes('accept-claim') && (
        <button
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-all shadow-xs"
          onClick={() => handleActionClick('accept-claim')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'accept-claim'
            ? 'Clearing...'
            : executedAction === 'accept-claim'
            ? '✓ Bid Accepted & Captured'
            : 'Accept Synthetic Bid'}
        </button>
      )}
      {hateoasAllowedActions.length === 0 && (
        <span className="text-xs text-slate-400 italic">No available actions</span>
      )}
    </div>
  );
}
