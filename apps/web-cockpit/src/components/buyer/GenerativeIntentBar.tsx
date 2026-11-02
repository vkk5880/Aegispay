'use client';

import React, { useState } from 'react';
import { Search, Sparkles, SlidersHorizontal, ArrowRight, CornerDownLeft, Tag } from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface ParsedSearchIntent {
  rawQuery: string;
  categoryIds: string[];
  maxBudgetCents: number;
  extractedKeywords: string[];
  attributes: {
    color?: string;
    style?: string;
    shippingPreference?: 'FAST' | 'STANDARD' | 'ANY';
  };
}

interface GenerativeIntentBarProps {
  onSearchIntent?: (intent: ParsedSearchIntent) => void;
  isLoading?: boolean;
}

const PRESET_INTENTS = [
  {
    label: 'Minimalist Ergonomic Workspace < $400',
    prompt: 'Find me a minimalist ergonomic workspace under $400 with walnut wood and fast shipping',
  },
  {
    label: 'Audiophile Studio Setup < $350',
    prompt: 'Find me a studio ANC headphone and USB DAC amp setup under $350 with high fidelity',
  },
  {
    label: 'Modern Minimal Desk Organizer < $150',
    prompt: 'Precision felt and walnut desk organizer pad with magnetic phone charging under $150',
  },
];

export function GenerativeIntentBar({ onSearchIntent, isLoading = false }: GenerativeIntentBarProps) {
  const [query, setQuery] = useState('');
  const [activeIntent, setActiveIntent] = useState<ParsedSearchIntent | null>(null);

  const parseNaturalLanguage = (text: string): ParsedSearchIntent => {
    const lower = text.toLowerCase();

    // 1. Extract budget ceiling (e.g. "under $400", "under 400", "< $350", "budget 500")
    let maxBudgetCents = 40000; // Default $400.00
    const priceMatch = lower.match(/(?:under|below|<|\$|budget\s*of?)\s*\$?(\d+(?:\.\d{2})?)/i);
    if (priceMatch && priceMatch[1]) {
      const parsedNum = parseFloat(priceMatch[1]);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        maxBudgetCents = Math.round(parsedNum * 100);
      }
    }

    // 2. Extract Channel3 categories
    const categoryIds: string[] = [];
    if (/workspace|desk|ergonomic|chair|pad/i.test(lower)) {
      categoryIds.push('workspace');
    }
    if (/audio|headphone|anc|dac|amp|speaker|sound/i.test(lower)) {
      categoryIds.push('audio');
    }
    if (/electronic|usb|charger|magsafe|gadget/i.test(lower)) {
      categoryIds.push('electronics');
    }
    if (/cable|keyboard|mouse|peripheral/i.test(lower)) {
      categoryIds.push('peripherals');
    }
    if (categoryIds.length === 0) {
      categoryIds.push('workspace', 'audio');
    }

    // 3. Extract attributes
    let style: string | undefined;
    if (lower.includes('minimalist') || lower.includes('minimal')) style = 'Minimalist';
    else if (lower.includes('nordic') || lower.includes('scandinavian')) style = 'Nordic';
    else if (lower.includes('executive')) style = 'Executive';

    let color: string | undefined;
    if (lower.includes('walnut')) color = 'Walnut';
    else if (lower.includes('midnight') || lower.includes('black')) color = 'Midnight Black';
    else if (lower.includes('silver')) color = 'Silver';

    let shippingPreference: 'FAST' | 'STANDARD' | 'ANY' = 'ANY';
    if (lower.includes('fast') || lower.includes('express') || lower.includes('2-day')) {
      shippingPreference = 'FAST';
    }

    // 4. Extract keywords
    const stopWords = new Set(['find', 'me', 'a', 'an', 'the', 'under', 'with', 'and', 'for', 'in', 'of', 'setup']);
    const extractedKeywords = text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

    return {
      rawQuery: text,
      categoryIds,
      maxBudgetCents,
      extractedKeywords,
      attributes: {
        color,
        style,
        shippingPreference,
      },
    };
  };

  const handleExecute = (promptText: string) => {
    if (!promptText.trim()) return;
    const parsed = parseNaturalLanguage(promptText);
    setActiveIntent(parsed);
    if (onSearchIntent) {
      onSearchIntent(parsed);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecute(query);
  };

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-cyan-200/80 dark:border-cyan-500/30 rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Decorative gradient glow */}
      <div className="absolute -top-16 -left-16 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1e293b] gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              AI Generative Intent Bar
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                Channel3 Vector Parsing
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Transform natural language desires into Channel3 vector search queries and cryptographic spend boundaries
            </p>
          </div>
        </div>

        {activeIntent && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 dark:text-slate-400">Parsed Ceiling:</span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 font-bold">
              {formatCents(activeIntent.maxBudgetCents)}
            </span>
          </div>
        )}
      </div>

      {/* Main Conversational Input Bar */}
      <form onSubmit={handleSubmit} className="mt-5 relative">
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-cyan-600 dark:text-cyan-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Find me a minimalist ergonomic workspace under $400 with walnut wood and fast shipping...'
            className="w-full pl-12 pr-32 py-3.5 bg-slate-50 dark:bg-[#060b14] border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="absolute right-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs tracking-wide transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {isLoading ? (
              <span className="animate-spin text-sm">⟳</span>
            ) : (
              <>
                <span>Solve</span>
                <CornerDownLeft className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick-Prompt Chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Tag className="w-3 h-3 text-cyan-500" />
          Suggestions:
        </span>
        {PRESET_INTENTS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setQuery(preset.prompt);
              handleExecute(preset.prompt);
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-cyan-50 dark:bg-slate-900/60 dark:hover:bg-cyan-950/40 border border-slate-200 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-500/40 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all text-left"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Live Natural Language Parameter Extraction Pill Breakdown */}
      {activeIntent && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1e293b] flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Channel3 Parameters:</span>

          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30 font-mono text-[11px]">
            Budget: {formatCents(activeIntent.maxBudgetCents)}
          </span>

          {activeIntent.categoryIds.map((cat) => (
            <span
              key={cat}
              className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 font-mono text-[11px]"
            >
              Cat: {cat}
            </span>
          ))}

          {activeIntent.attributes.color && (
            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 font-mono text-[11px]">
              Color: {activeIntent.attributes.color}
            </span>
          )}

          {activeIntent.attributes.style && (
            <span className="px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-500/30 font-mono text-[11px]">
              Style: {activeIntent.attributes.style}
            </span>
          )}

          {activeIntent.attributes.shippingPreference !== 'ANY' && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 font-mono text-[11px]">
              Shipping: {activeIntent.attributes.shippingPreference}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
