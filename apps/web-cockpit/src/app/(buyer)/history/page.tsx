import React, { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { HistoryContent } from './HistoryContent';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function HistoryPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8 text-center text-slate-500 font-mono text-xs">Loading order ledger...</div>}>
        <HistoryContent />
      </Suspense>
    </ErrorBoundary>
  );
}
