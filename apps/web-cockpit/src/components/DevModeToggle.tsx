'use client';

import React from 'react';
import { useUiMode } from '@/context/UiModeContext';
import { Terminal, Eye, EyeOff, Wrench } from 'lucide-react';

export function DevModeToggle() {
  const { isProduction, isDevEnvironment, showTechnicalDetails, toggleTechnicalDetails } =
    useUiMode();

  // In strict production, technical details and dev toggles are completely hidden
  if (isProduction || !isDevEnvironment) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleTechnicalDetails}
      title={
        showTechnicalDetails
          ? 'Technical Details: ON (Click to switch to Clean User Mode)'
          : 'Technical Details: OFF (Click to view Developer Details)'
      }
      aria-label="Toggle technical details"
      aria-pressed={showTechnicalDetails}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer select-none ${
        showTechnicalDetails
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700/80 shadow-xs'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <Terminal className={`w-3.5 h-3.5 ${showTechnicalDetails ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
      <span className="hidden md:inline font-mono text-[11px]">
        {showTechnicalDetails ? 'Dev Mode: ON' : 'Dev Mode: OFF'}
      </span>
      <span className="md:hidden font-mono text-[11px]">
        {showTechnicalDetails ? 'Dev' : 'User'}
      </span>
      {showTechnicalDetails ? (
        <Eye className="w-3 h-3 text-amber-500" />
      ) : (
        <EyeOff className="w-3 h-3 text-slate-400" />
      )}
    </button>
  );
}
