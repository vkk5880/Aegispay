'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { webLogger as logger } from '@/lib/logger';
import { Search, Sparkles, ArrowRight, CornerDownLeft, RotateCcw, AlertTriangle, Zap } from 'lucide-react';

export interface RecoveryPill {
  label: string;
  prompt: string;
  type?: 'free_shipping' | 'stock' | 'substitute' | 'variant' | 'general';
}

export interface ChatFlowProps {
  onSearch?: (query: string) => void;
  disabled?: boolean;
  initialQuery?: string;
  placeholder?: string;
  messageWarning?: string;
  recoveryPills?: RecoveryPill[];
  onSelectRecoveryPill?: (pill: RecoveryPill) => void;
}

/**
 * Infers proactive 1-tap recovery pills from ACP MessageWarnings
 */
export function inferRecoveryPillsFromWarning(warning?: string): RecoveryPill[] {
  if (!warning || typeof warning !== 'string') return [];
  const pills: RecoveryPill[] = [];
  const lower = warning.toLowerCase();

  if (lower.includes('shipping') || lower.includes('away from free')) {
    const match = warning.match(/\$(\d+(\.\d{2})?)/);
    const amount = match ? match[0] : '$8';
    pills.push({
      label: `+ Add ${amount} filler item for free shipping`,
      prompt: `Find a useful filler item under ${amount} to qualify for free shipping`,
      type: 'free_shipping',
    });
  }

  if (lower.includes('low') && (lower.includes('stock') || lower.includes('inventory'))) {
    pills.push({
      label: 'Accept alternative seller with verified stock',
      prompt: 'Show alternative verified sellers with immediate stock',
      type: 'substitute',
    });
  }

  if (lower.includes('size') || lower.includes('option') || lower.includes('variant')) {
    pills.push({
      label: 'Disambiguate size / color options',
      prompt: 'Help me select the best variant for my requirements',
      type: 'variant',
    });
  }

  return pills;
}

type FlowState = 'IDLE' | 'CLARIFYING' | 'SEARCHING';

const VS_PATTERN = /\s+(?:vs\.?|versus)\s+/i;

/**
 * Sanitizes chat inputs against XSS and injection payloads.
 * Strips script tags, HTML markup, dangerous schemes, and controls length.
 */
export function sanitizeChatInput(input: string, maxLength = 1000, trim = true): string {
  if (typeof input !== 'string') return '';
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '');
  sanitized = sanitized.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');
  const sliced = sanitized.slice(0, maxLength);
  return trim ? sliced.trim() : sliced;
}

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
  messageWarning,
  recoveryPills,
  onSelectRecoveryPill,
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

  const effectivePills: RecoveryPill[] =
    recoveryPills && recoveryPills.length > 0
      ? recoveryPills
      : inferRecoveryPillsFromWarning(messageWarning);

  const handlePillClick = (pill: RecoveryPill) => {
    logger.info('[ChatFlow:RecoveryPill] Proactive recovery pill clicked', {
      label: pill.label,
      prompt: pill.prompt,
      type: pill.type,
    });
    if (onSelectRecoveryPill) {
      onSelectRecoveryPill(pill);
    }
    setQuery(pill.prompt);
    onSearch?.(pill.prompt);
  };

  useEffect(() => {
    if (flowState === 'CLARIFYING' && questions.length > 0) {
      if (revealedIdx < questions.length - 1) {
        const timer = setTimeout(() => {
          logger.debug('[ChatFlow:Clarifying] Revealing next clarification question', {
            revealedIdx: revealedIdx + 1,
            totalQuestions: questions.length,
          });
          setRevealedIdx((prev) => prev + 1);
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [flowState, questions, revealedIdx]);

  const triggerFinalSearch = useCallback(
    (q: string) => {
      const clean = sanitizeChatInput(q);
      logger.info('[ChatFlow:Transition] Transitioning to SEARCHING state', {
        rawQuery: q,
        cleanQuery: clean,
      });
      setEnrichedQuery(clean);
      setFlowState('SEARCHING');
      onSearch?.(clean);
    },
    [onSearch]
  );

  const triggerClarify = useCallback(
    async (q: string) => {
      const qClean = sanitizeChatInput(q);
      if (!qClean) {
        logger.debug('[ChatFlow:Clarify] Aborted triggerClarify due to empty query');
        return;
      }
      if (disabled) {
        logger.debug('[ChatFlow:Clarify] Aborted triggerClarify because ChatFlow is disabled');
        return;
      }

      if (VS_PATTERN.test(qClean)) {
        logger.info('[ChatFlow:Clarify] VS comparison pattern detected in query, bypassing clarification', {
          query: qClean,
        });
        triggerFinalSearch(qClean);
        return;
      }

      logger.info('[ChatFlow:Clarify] Dispatching clarification check to /api/buyer/clarify', {
        query: qClean,
      });
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

        logger.debug('[ChatFlow:Clarify] Received response from /api/buyer/clarify', {
          needsClarification: data.needs_clarification,
          questionCount: data.questions?.length || 0,
        });

        if (data.needs_clarification && data.questions && data.questions.length > 0) {
          logger.info('[ChatFlow:Transition] Transitioning to CLARIFYING state', {
            questions: data.questions,
          });
          setQuestions(data.questions.map((item: string) => sanitizeChatInput(item)));
          setFlowState('CLARIFYING');
        } else {
          logger.info('[ChatFlow:Clarify] No clarification needed, proceeding directly to search');
          triggerFinalSearch(qClean);
        }
      } catch (err: any) {
        logger.error('[ChatFlow:Clarify] Clarification fetch failed, gracefully falling back to direct search', {
          error: err?.message || String(err),
          stack: err?.stack,
          query: qClean,
        });
        triggerFinalSearch(qClean);
      } finally {
        setIsClarifyingLoading(false);
      }
    },
    [disabled, triggerFinalSearch]
  );

  useEffect(() => {
    if (initialQuery && initialQuery.trim() !== '') {
      setQuery(initialQuery);
      triggerClarify(initialQuery);
    }
  }, [initialQuery, triggerClarify]);

  async function handleInitialSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = sanitizeChatInput(query);
    logger.info('[ChatFlow:Submit] Initial search form submitted', { rawQuery: query, cleanQuery: clean });
    if (!clean) {
      logger.debug('[ChatFlow:Submit] Search cancelled due to empty sanitized query');
      return;
    }
    setQuery(clean);
    triggerClarify(clean);
  }

  async function handleEnrichSearch(e: React.FormEvent) {
    e.preventDefault();
    if (isEnriching) {
      logger.debug('[ChatFlow:Enrich] Aborted enrichment because already enriching');
      return;
    }
    setIsEnriching(true);

    const cleanQuery = sanitizeChatInput(query);
    const sanitizedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      sanitizedAnswers[k] = sanitizeChatInput(v);
    }

    logger.info('[ChatFlow:Enrich] Dispatching clarification answers to /api/buyer/enrich', {
      query: cleanQuery,
      answersCount: Object.keys(sanitizedAnswers).length,
    });

    try {
      const data = await fetchWithTimeout('/api/buyer/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, answers: sanitizedAnswers }),
      });
      const finalQ = sanitizeChatInput(data.enriched_query || cleanQuery);
      logger.info('[ChatFlow:Enrich] Enriched query received from server', {
        originalQuery: cleanQuery,
        enrichedQuery: finalQ,
      });
      triggerFinalSearch(finalQ || cleanQuery);
    } catch (err: any) {
      logger.error('[ChatFlow:Enrich] Query enrichment fetch failed, falling back to original query', {
        error: err?.message || String(err),
        stack: err?.stack,
        query: cleanQuery,
      });
      triggerFinalSearch(cleanQuery);
    } finally {
      setIsEnriching(false);
    }
  }

  function handleReset() {
    logger.info('[ChatFlow:Reset] Resetting ChatFlow to IDLE state');
    setFlowState('IDLE');
    setQuery('');
    setEnrichedQuery('');
    setQuestions([]);
    setAnswers({});
    setRevealedIdx(-1);
    setTimeout(() => {
      // Prevent viewport jump on mobile viewports: check matchMedia for hover/pointer
      const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (!isMobile) {
        inputRef.current?.focus({ preventScroll: true });
      }
    }, 20);
  }

  if (flowState === 'SEARCHING') {
    return (
      <div
        className="flex flex-col items-center gap-3 w-full animate-fade-in-up"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
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
      <div
        className="relative w-full max-w-2xl mx-auto rounded-2xl p-6 shadow-2xl flex flex-col gap-5 border border-slate-800 bg-slate-900/95 backdrop-blur-xl"
        role="region"
        aria-label="Search clarification"
        aria-live="polite"
      >
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
                  value={answers[q] ?? ''}
                  onChange={(e) => {
                    const cleanVal = sanitizeChatInput(e.target.value, 1000, false);
                    setAnswers((prev) => ({ ...prev, [q]: cleanVal }));
                  }}
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
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || isClarifyingLoading}
          placeholder={placeholder}
          aria-label="Describe what you want to buy"
          className="flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-slate-500 min-w-0"
        />
        <button
          type="submit"
          disabled={disabled || isClarifyingLoading || !query.trim()}
          aria-label="Execute search"
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
        >
          <span>{isClarifyingLoading ? 'Analyzing...' : 'Execute'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Phase 4: Proactive 1-Tap Recovery Action Pills */}
      {(messageWarning || effectivePills.length > 0) && (
        <div className="mt-3 flex flex-col gap-2 animate-fade-in-up" role="region" aria-label="Proactive recommendations">
          {messageWarning && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-1.5 shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{messageWarning}</span>
            </div>
          )}
          {effectivePills.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {effectivePills.map((pill, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handlePillClick(pill)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 shadow-sm transition-all cursor-pointer group"
                >
                  <Zap className="w-3 h-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
