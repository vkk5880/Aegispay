'use client';

import React from 'react';
import { useUiMode } from '@/context/UiModeContext';
import { Terminal, Eye, EyeOff } from 'lucide-react';

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
          ? 'Dev Mode: ON (Click to switch to Clean User Mode)'
          : 'Dev Mode: OFF (Click to view Developer Details)'
      }
      aria-label="Toggle technical details"
      aria-pressed={showTechnicalDetails}
      className={`group relative w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 border cursor-pointer select-none active:scale-95 shadow-xs ${
        showTechnicalDetails
          ? 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/40 shadow-xs'
          : 'bg-slate-100 dark:bg-[#060b14] text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
      }`}
    >
      <Terminal className={`w-4 h-4 ${showTechnicalDetails ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
      
      {/* Floating tooltip on hover */}
      <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md z-50">
        {showTechnicalDetails ? 'Dev Mode: ON' : 'Dev Mode: OFF'}
      </span>
    </button>
  );
}
