'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2, ArrowRight } from 'lucide-react';
import { VoiceSearchButton } from './VoiceSearchButton';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  initialValue?: string;
  className?: string;
  suggestions?: string[];
  debounceMs?: number;
}

const DEFAULT_SUGGESTIONS = [
  'Sony WH-1000XM5 under $350',
  'Wireless mechanical keyboard',
  'AirPods Pro 2 USB-C',
  '4K USB-C monitor',
];

export function SearchBar({
  onSearch,
  loading = false,
  placeholder = 'Search products, compare models, or describe your budget...',
  initialValue = '',
  className = '',
  suggestions = DEFAULT_SUGGESTIONS,
  debounceMs = 0,
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const lastSearchedRef = useRef<string>(initialValue.trim());

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Update value if initialValue changes externally
  useEffect(() => {
    setValue(initialValue);
    lastSearchedRef.current = initialValue.trim();
    clearDebounceTimer();
  }, [initialValue, clearDebounceTimer]);

  // Clean up debounce timer on component unmount
  useEffect(() => {
    return () => {
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  const triggerSearch = useCallback(
    (queryToSearch: string) => {
      clearDebounceTimer();
      const trimmed = (queryToSearch || '').trim();
      if (!trimmed) {
        return;
      }
      if (trimmed === lastSearchedRef.current && !loading) {
        return;
      }
      lastSearchedRef.current = trimmed;
      onSearch(trimmed);
    },
    [clearDebounceTimer, loading, onSearch]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setValue(nextVal);

    if (debounceMs > 0) {
      clearDebounceTimer();
      const trimmed = nextVal.trim();
      if (!trimmed) {
        // Prevent API flooding on whitespace or empty query
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerSearch(nextVal);
      }, debounceMs);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearDebounceTimer();
    const trimmed = (value || '').trim();
    if (!trimmed || loading) return;
    triggerSearch(trimmed);
  };

  const handleClear = () => {
    clearDebounceTimer();
    setValue('');
    inputRef.current?.focus();
  };

  const handleSelectSuggestion = (s: string) => {
    clearDebounceTimer();
    setValue(s);
    triggerSearch(s);
  };

  return (
    <div className={`w-full max-w-2xl mx-auto space-y-2.5 ${className}`}>
      {/* Search Input Box */}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-xl focus-within:border-cyan-500 transition-all p-1.5"
      >
        <div className="pl-3.5 pr-2 text-slate-400">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={handleInputChange}
          disabled={loading}
          placeholder={placeholder}
          aria-label="Search products, compare models, or describe your budget"
          className="flex-1 bg-transparent px-2 py-2.5 text-xs sm:text-sm text-white outline-none placeholder:text-slate-500 min-w-0"
        />

        {value && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-lg text-slate-400 hover:text-white mr-1 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Clear search query"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <VoiceSearchButton
          onTranscript={(spokenText) => {
            setValue(spokenText);
            triggerSearch(spokenText);
          }}
          disabled={loading}
          className="mr-1"
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="Submit search query"
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <span>Search</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Suggested Queries */}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
          <span className="text-[10px] font-mono text-slate-500">Popular:</span>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/40 transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
