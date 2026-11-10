'use client';

import React from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { HistoryContent } from './HistoryContent';

export default function HistoryPage() {
  return (
    <ErrorBoundary>
      <HistoryContent />
    </ErrorBoundary>
  );
}
