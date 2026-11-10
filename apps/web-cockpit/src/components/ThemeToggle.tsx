'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Laptop } from 'lucide-react';

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center bg-slate-100 dark:bg-[#060b14] p-1 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner"
      role="group"
      aria-label="Theme selector"
    >
      <button
        onClick={() => setTheme('light')}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
          theme === 'light'
            ? 'bg-white text-amber-600 shadow-xs border border-slate-200 font-bold'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
        title="Light Mode"
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Light</span>
      </button>

      <button
        onClick={() => setTheme('dark')}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
          theme === 'dark'
            ? 'bg-[#0e172a] text-cyan-400 shadow-xs border border-cyan-500/30 font-bold'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
        title="Dark Mode"
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </button>

      <button
        onClick={() => setTheme('system')}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
          theme === 'system'
            ? 'bg-white dark:bg-[#0e172a] text-cyan-600 dark:text-cyan-400 shadow-xs border border-slate-200 dark:border-cyan-500/30 font-bold'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
        title={`System Theme (${resolvedTheme})`}
      >
        <Laptop className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">System</span>
      </button>
    </div>
  );
}
