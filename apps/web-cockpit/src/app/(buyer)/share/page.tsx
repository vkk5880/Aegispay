'use client';

import React, { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ShareContent } from './ShareContent';

export default function SharePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-[#060b14] text-white p-20 text-center font-mono text-sm animate-pulse">Loading Shared Recommendation...</div>}>
        <ShareContent />
      </Suspense>
    </ErrorBoundary>
  );
}
