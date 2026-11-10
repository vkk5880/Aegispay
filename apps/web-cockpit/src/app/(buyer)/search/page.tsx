'use client';

import React, { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SearchContent } from './SearchContent';

export default function SearchPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-[#060b14] text-white p-20 text-center font-mono text-sm animate-pulse">Initializing AegisPay Commerce Search...</div>}>
        <SearchContent />
      </Suspense>
    </ErrorBoundary>
  );
}
