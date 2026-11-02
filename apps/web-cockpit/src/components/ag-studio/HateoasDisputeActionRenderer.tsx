'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Undo2, Eye, FileText, Check, AlertTriangle, X } from 'lucide-react';

interface HateoasDisputeActionRendererProps {
  hateoasAllowedActions: string[];
  disputeId: string;
  onActionComplete?: (action: string) => void;
}

export function HateoasDisputeActionRenderer({
  hateoasAllowedActions,
  disputeId,
  onActionComplete,
}: HateoasDisputeActionRendererProps) {
  // Hold-to-confirm state (2 seconds)
  const [holdingAction, setHoldingAction] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Non-blocking toast with 5-second "Undo" buffer
  const [pendingToastAction, setPendingToastAction] = useState<string | null>(null);
  const [toastCountdown, setToastCountdown] = useState(5);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Committed/executed action state
  const [executedAction, setExecutedAction] = useState<string | null>(null);

  // Destructive pdf-lib preview modal
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (toastIntervalRef.current) clearInterval(toastIntervalRef.current);
    };
  }, []);

  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldingAction(null);
    setHoldProgress(0);
  };

  const handleHoldStart = (action: string) => {
    if (executedAction || pendingToastAction) return;

    setHoldingAction(action);
    setHoldProgress(0);

    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);
    }, 40);

    holdTimerRef.current = setTimeout(() => {
      clearHold();
      triggerToastBuffer(action);
    }, duration);
  };

  const triggerToastBuffer = (action: string) => {
    setPendingToastAction(action);
    setToastCountdown(5);

    toastIntervalRef.current = setInterval(() => {
      setToastCountdown((prev) => {
        if (prev <= 1) {
          if (toastIntervalRef.current) clearInterval(toastIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    toastTimeoutRef.current = setTimeout(() => {
      commitAction(action);
    }, 5000);
  };

  const commitAction = (action: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastIntervalRef.current) clearInterval(toastIntervalRef.current);
    setPendingToastAction(null);
    setExecutedAction(action);
    if (onActionComplete) {
      onActionComplete(action);
    }
  };

  const handleUndo = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastIntervalRef.current) clearInterval(toastIntervalRef.current);
    setPendingToastAction(null);
    setHoldProgress(0);
    setHoldingAction(null);
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'provide-evidence':
        return 'Submit PDF Defense';
      case 'make-offer':
        return 'Offer 35% Settlement';
      case 'accept-claim':
        return 'Accept Synthetic Bid';
      default:
        return action;
    }
  };

  const getExecutedLabel = (action: string) => {
    switch (action) {
      case 'provide-evidence':
        return '✓ Defense PDF Submitted';
      case 'make-offer':
        return '✓ 35% Offer Dispatched';
      case 'accept-claim':
        return '✓ Bid Accepted & Captured';
      default:
        return `✓ ${action} Executed`;
    }
  };

  return (
    <div data-testid="hateoas-action-renderer" className="relative space-y-2 py-1">
      <div className="flex flex-wrap items-center gap-2">
        {hateoasAllowedActions.includes('provide-evidence') && (
          <div className="flex items-center gap-1.5">
            {/* 2-second Hold to Confirm button */}
            <button
              type="button"
              data-testid="hold-btn-provide-evidence"
              onMouseDown={() => handleHoldStart('provide-evidence')}
              onMouseUp={clearHold}
              onMouseLeave={clearHold}
              onTouchStart={() => handleHoldStart('provide-evidence')}
              onTouchEnd={clearHold}
              disabled={executedAction !== null || pendingToastAction !== null}
              className="relative overflow-hidden px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 transition-all shadow-xs select-none"
            >
              {holdingAction === 'provide-evidence' && (
                <div
                  className="absolute inset-0 bg-blue-600/60 transition-all duration-75"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {holdingAction === 'provide-evidence' ? (
                  <span>Hold 2s to Confirm ({Math.round(holdProgress)}%)</span>
                ) : executedAction === 'provide-evidence' ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> Defense PDF Submitted
                  </span>
                ) : pendingToastAction === 'provide-evidence' ? (
                  <span>Pending Commit...</span>
                ) : (
                  <span>Submit PDF Defense (Hold 2s)</span>
                )}
              </span>
            </button>

            {/* Dossier Preview Modal Trigger */}
            <button
              type="button"
              data-testid="preview-pdf-btn"
              onClick={() => setShowPdfPreviewModal(true)}
              title="Preview Destructive pdf-lib Dossier"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {hateoasAllowedActions.includes('make-offer') && (
          <button
            type="button"
            data-testid="hold-btn-make-offer"
            onMouseDown={() => handleHoldStart('make-offer')}
            onMouseUp={clearHold}
            onMouseLeave={clearHold}
            onTouchStart={() => handleHoldStart('make-offer')}
            onTouchEnd={clearHold}
            disabled={executedAction !== null || pendingToastAction !== null}
            className="relative overflow-hidden px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-all shadow-xs select-none"
          >
            {holdingAction === 'make-offer' && (
              <div
                className="absolute inset-0 bg-amber-800/80 transition-all duration-75"
                style={{ width: `${holdProgress}%` }}
              />
            )}
            <span className="relative z-10">
              {holdingAction === 'make-offer'
                ? `Hold 2s to Confirm (${Math.round(holdProgress)}%)`
                : executedAction === 'make-offer'
                ? getExecutedLabel('make-offer')
                : pendingToastAction === 'make-offer'
                ? 'Pending Commit...'
                : 'Offer 35% Settlement (Hold 2s)'}
            </span>
          </button>
        )}

        {hateoasAllowedActions.includes('accept-claim') && (
          <button
            type="button"
            data-testid="hold-btn-accept-claim"
            onMouseDown={() => handleHoldStart('accept-claim')}
            onMouseUp={clearHold}
            onMouseLeave={clearHold}
            onTouchStart={() => handleHoldStart('accept-claim')}
            onTouchEnd={clearHold}
            disabled={executedAction !== null || pendingToastAction !== null}
            className="relative overflow-hidden px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-all shadow-xs select-none"
          >
            {holdingAction === 'accept-claim' && (
              <div
                className="absolute inset-0 bg-emerald-800/80 transition-all duration-75"
                style={{ width: `${holdProgress}%` }}
              />
            )}
            <span className="relative z-10">
              {holdingAction === 'accept-claim'
                ? `Hold 2s to Confirm (${Math.round(holdProgress)}%)`
                : executedAction === 'accept-claim'
                ? getExecutedLabel('accept-claim')
                : pendingToastAction === 'accept-claim'
                ? 'Pending Commit...'
                : 'Accept Synthetic Bid (Hold 2s)'}
            </span>
          </button>
        )}

        {hateoasAllowedActions.length === 0 && (
          <span className="text-xs text-slate-400 italic">No available actions</span>
        )}
      </div>

      {/* 5-Second Non-Blocking Toast with Undo Buffer */}
      {pendingToastAction && (
        <div
          data-testid="safety-undo-toast"
          className="flex items-center justify-between p-2.5 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-1 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              Executing <b>{getActionLabel(pendingToastAction)}</b> in {toastCountdown}s...
            </span>
          </div>
          <button
            type="button"
            data-testid="toast-undo-btn"
            onClick={handleUndo}
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-xs transition-colors shadow-xs"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>
        </div>
      )}

      {/* Preview Modal for Destructive pdf-lib Dossiers */}
      {showPdfPreviewModal && (
        <div
          data-testid="pdf-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Evidence Dossier PDF Preview
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Dispute ID: {disputeId} · Compiled via pdf-lib
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfPreviewModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dossier Content Summary */}
            <div className="space-y-3 bg-slate-50 dark:bg-[#080d19] p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span>Dossier: PROOF_OF_FULFILLMENT.pdf</span>
                <span>Size: 142.8 KB</span>
              </div>
              <ul className="space-y-2 text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" />
                  <span>
                    <b>Carrier Telemetry:</b> USPS Tracking #9400111899562537684029 registered in PayPal Shipment Tracking v1 with geo-fenced delivery proof.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-rose-500 shrink-0" />
                  <span>
                    <b>Forensic Diff:</b> Side-by-side comparison with Channel3 studio baseline reference and tamper metadata logs.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                  <span>
                    <b>Legal Statement:</b> Certified merchant fulfillment declaration with buyer signature verification.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500 italic">
                Submitting this dossier will irreversibly alter the dispute state in PayPal Sandbox.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPdfPreviewModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  data-testid="modal-confirm-submit-btn"
                  onClick={() => {
                    setShowPdfPreviewModal(false);
                    triggerToastBuffer('provide-evidence');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-xs"
                >
                  Confirm & Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
