'use client';

import React from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { WatchlistContent } from './WatchlistContent';

export default function WatchlistPage() {
  return (
    <ErrorBoundary>
      <WatchlistContent />
    </ErrorBoundary>
  );
}
