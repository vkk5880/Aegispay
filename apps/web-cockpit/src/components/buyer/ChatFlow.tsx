'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Sparkles, ArrowRight, CornerDownLeft, RotateCcw } from 'lucide-react';

export interface ChatFlowProps {
  onSearch: (query: string) => void;
  disabled?: boolean;
  initialQuery?: string;
  placeholder?: string;
}

type FlowState = 'IDLE' | 'CLARIFYING' | 'SEARCHING';

const VS_PATTERN = /\s+(?:vs\.?|versus)\s+/i;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

export function ChatFlow({
  onSearch,
  disabled,
  initialQuery,
  placeholder = 'Describe what you want to buy (e.g. Sony WH-1000XM5 under $350)...',
}: ChatFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>('IDLE');
  const [query, setQuery] = useState('');
  const [enrichedQuery, setEnrichedQuery] = useState('');
  const [isClarifyingLoading, setIsClarifyingLoading] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealedIdx, setRevealedIdx] = useState(-1);
  const [isEnriching, setIsEnriching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (flowState === 'CLARIFYING' && questions.length > 0) {
      if (revealedIdx < questions.length - 1) {
        const timer = setTimeout(() => {
          setRevealedIdx((prev) => prev + 1);
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [flowState, questions, revealedIdx]);

  useEffect(() => {
    if (initialQuery && initialQuery.trim() !== '') {
      setQuery(initialQuery);
      triggerClarify(initialQuery);
    }
  }, [initialQuery]);

  async function handleInitialSearch(e: React.FormEvent) {
    e.preventDefault();
    triggerClarify(query);
  }

  async function triggerClarify(q: string) {
    const qClean = q.trim();
    if (!qClean || disabled) return;

    if (VS_PATTERN.test(qClean)) {
      triggerFinalSearch(qClean);
      return;
    }

    setIsClarifyingLoading(true);
    setQuestions([]);
    setAnswers({});
    setRevealedIdx(-1);

    try {
      const data = await fetchWithTimeout('/api/buyer/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: qClean }),
      });

      if (data.needs_clarification && data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setFlowState('CLARIFYING');
      } else {
        triggerFinalSearch(qClean);
      }
    } catch {
      triggerFinalSearch(qClean);
    } finally {
      setIsClarifyingLoading(false);
    }
  }

  async function handleEnrichSearch(e: React.FormEvent) {
    e.preventDefault();
    if (isEnriching) return;
    setIsEnriching(true);

    try {
      const data = await fetchWithTimeout('/api/buyer/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, answers }),
      });
      const finalQ = data.enriched_query || query;
      triggerFinalSearch(finalQ);
    } catch {
      triggerFinalSearch(query);
    } finally {
      setIsEnriching(false);
    }
  }

  function triggerFinalSearch(q: string) {
    setEnrichedQuery(q);
    setFlowState('SEARCHING');
    onSearch(q);
  }

  function handleReset() {
    setFlowState('IDLE');
    setQuery('');
    setEnrichedQuery('');
    setQuestions([]);
    setAnswers({});
    setRevealedIdx(-1);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
  }

  if (flowState === 'SEARCHING') {
    return (
      <div className="flex flex-col items-center gap-3 w-full animate-fade-in-up">
        <div className="relative flex items-center gap-3 rounded-full px-5 py-2.5 shadow-xl border border-cyan-500/40 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-1.5 h-4">
            <span className="w-1.5 h-3 bg-cyan-400 rounded-full animate-pulse" />
            <span className="w-1.5 h-4 bg-cyan-400 rounded-full animate-pulse delay-75" />
            <span className="w-1.5 h-2 bg-cyan-400 rounded-full animate-pulse delay-150" />
          </div>
          <span className="text-xs sm:text-sm font-medium text-slate-200">
            Synthesizing parameters for: <strong className="text-cyan-300 font-mono">{enrichedQuery}</strong>
          </span>
        </div>
        <button
          onClick={handleReset}
          className="text-[11px] text-slate-500 hover:text-cyan-400 font-mono flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>[ ABORT & RESET QUERY ]</span>
        </button>
      </div>
    );
  }

  if (flowState === 'CLARIFYING') {
    return (
      <div className="relative w-full max-w-2xl mx-auto rounded-2xl p-6 shadow-2xl flex flex-col gap-5 border border-slate-800 bg-slate-900/95 backdrop-blur-xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Clarification Engine
          </span>
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* User original query */}
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-none px-4 py-2 text-xs font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
            {query}
          </div>
        </div>

        {/* Cascading questions */}
        <form onSubmit={handleEnrichSearch} className="space-y-4">
          {questions.map((q, idx) => {
            if (idx > revealedIdx) return null;
            return (
              <div key={idx} className="space-y-2 animate-fade-in-up">
                <div className="rounded-2xl rounded-tl-none px-4 py-2.5 text-xs bg-slate-800/80 text-slate-200 border border-slate-700/60 w-fit">
                  {q}
                </div>
                <input
                  type="text"
                  placeholder="Enter your specification..."
                  value={answers[q] || ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  autoFocus={idx === revealedIdx}
                />
              </div>
            );
          })}

          {revealedIdx === questions.length - 1 && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isEnriching}
                className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>{isEnriching ? 'Synthesizing...' : 'Execute Optimized Search'}</span>
                <CornerDownLeft className="w-3 h-3" />
              </button>
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleInitialSearch} className="relative w-full max-w-2xl mx-auto">
      <div className="relative flex items-center bg-slate-900/90 border border-slate-700 rounded-2xl shadow-xl focus-within:border-cyan-500 transition-all p-1.5">
        <div className="pl-3 pr-2 text-slate-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || isClarifyingLoading}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-slate-500 min-w-0"
        />
        <button
          type="submit"
          disabled={disabled || isClarifyingLoading || !query.trim()}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
        >
          <span>{isClarifyingLoading ? 'Analyzing...' : 'Execute'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}
