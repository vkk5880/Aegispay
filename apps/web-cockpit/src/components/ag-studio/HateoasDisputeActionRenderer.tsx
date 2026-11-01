'use client';

import React, { useState } from 'react';

interface HateoasDisputeActionRendererProps {
  hateoasAllowedActions: string[];
  disputeId: string;
}

export function HateoasDisputeActionRenderer({ hateoasAllowedActions, disputeId }: HateoasDisputeActionRendererProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleActionClick = async (action: string) => {
    setLoadingAction(action);
    // Simulate optimistic execution to API
    setTimeout(() => {
      setLoadingAction(null);
      alert(`Executed action: ${action} for dispute ${disputeId}`);
    }, 1000);
  };

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {hateoasAllowedActions.includes('provide-evidence') && (
        <button
          className="px-3 py-1 bg-slate-800 text-white text-xs font-medium rounded hover:bg-slate-700 disabled:opacity-50"
          onClick={() => handleActionClick('provide-evidence')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'provide-evidence' ? 'Executing...' : '[Submit PDF Defense]'}
        </button>
      )}
      {hateoasAllowedActions.includes('make-offer') && (
        <button
          className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-500 disabled:opacity-50"
          onClick={() => handleActionClick('make-offer')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'make-offer' ? 'Executing...' : '[Offer 35% Partial]'}
        </button>
      )}
      {hateoasAllowedActions.includes('accept-claim') && (
        <button
          className="px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-500 disabled:opacity-50"
          onClick={() => handleActionClick('accept-claim')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'accept-claim' ? 'Executing...' : '[Accept Synthetic Bid]'}
        </button>
      )}
      {hateoasAllowedActions.length === 0 && (
        <span className="text-xs text-gray-400 italic">No available actions</span>
      )}
    </div>
  );
}
