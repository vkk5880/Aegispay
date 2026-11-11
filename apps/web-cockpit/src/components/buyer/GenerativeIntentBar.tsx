'use client';

import React, { useState } from 'react';
import { Search, Sparkles, SlidersHorizontal, ArrowRight, CornerDownLeft, Tag } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { AudioPromptButton } from './AudioPromptButton';

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
    <div className="relative group bg-white/95 dark:bg-[#0c1424]/90 border border-slate-200/80 dark:border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden backdrop-blur-xl transition-all">
      {/* Top radiant light */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-cyan-500/20 via-cyan-400 to-blue-500/20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200/80 dark:border-white/10 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              AI Generative Intent Bar
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 font-bold">
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
            <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold">
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
            className="w-full pl-12 pr-44 py-3.5 bg-slate-50/80 dark:bg-[#060b14]/80 border border-slate-200/80 dark:border-white/10 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans shadow-inner"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <AudioPromptButton
              onTranscript={(spoken) => {
                const nextQuery = query ? `${query.trim()} ${spoken}` : spoken;
                setQuery(nextQuery);
                const parsed = parseNaturalLanguage(nextQuery);
                setActiveIntent(parsed);
              }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs tracking-wide transition-all shadow-md shadow-cyan-600/25 flex items-center gap-1.5 disabled:opacity-40 active:scale-95 cursor-pointer"
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
            className="px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-cyan-50 dark:bg-white/5 dark:hover:bg-cyan-950/40 border border-slate-200/80 dark:border-white/10 hover:border-cyan-300 dark:hover:border-cyan-500/40 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all text-left font-medium active:scale-95 cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Live Natural Language Parameter Extraction Pill Breakdown */}
      {activeIntent && (
        <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-white/10 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Channel3 Parameters:</span>

          <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-mono text-[11px] font-bold">
            Budget: {formatCents(activeIntent.maxBudgetCents)}
          </span>

          {activeIntent.categoryIds.map((cat) => (
            <span
              key={cat}
              className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-mono text-[11px] font-bold"
            >
              Cat: {cat}
            </span>
          ))}

          {activeIntent.attributes.color && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono text-[11px] font-bold">
              Color: {activeIntent.attributes.color}
            </span>
          )}

          {activeIntent.attributes.style && (
            <span className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 font-mono text-[11px] font-bold">
              Style: {activeIntent.attributes.style}
            </span>
          )}

          {activeIntent.attributes.shippingPreference !== 'ANY' && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-bold">
              Shipping: {activeIntent.attributes.shippingPreference}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
