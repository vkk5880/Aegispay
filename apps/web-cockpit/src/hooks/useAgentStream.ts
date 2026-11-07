'use client';

import { useState, useEffect, useRef } from 'react';

export interface ScoredProduct {
  title: string;
  price: number;
  rating: number;
  review_count: number;
  source: string;
  link: string;
  score: number;
  /** Plain-English deal verdict from compare_agent */
  verdict?: string;
  /** CSS hex color for the verdict text */
  verdict_colour?: string;
  /** True when Serper/Groq returned an actual rating (not defaulted) */
  rating_verified?: boolean;
  /** Raw signal from Serper — false means rating was missing in API response */
  has_real_rating?: boolean;
  /** Synthetic 30-day historical average price (Price History Context) */
  historical_30d_avg?: number | null;
  /** % drop from 30-day average — positive means current price is lower */
  price_drop_pct?: number | null;
  /** Trust tier classification */
  trust_tier?: string;
}

export interface Recommendation extends ScoredProduct {
  justification: string;
  rank: number;
  total_compared: number;
  community_sentiment?: string;
}

export interface BudgetMiss {
  product: ScoredProduct;
  budget: number;
  overage: number;
  overage_pct: number;
  message: string;
}

export interface StreamResult {
  type: 'result';
  query: string;
  scored_products: ScoredProduct[];
  recommendation: Recommendation | null;
  budget_miss?: BudgetMiss | null;
  /** Two top contenders for the Battle Arena */
  battle_contenders?: ScoredProduct[] | null;
  /** LLM referee verdict from decision_agent */
  battle_report?: string | null;
  error: string | null;
}

const MAX_STREAM_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 8000;

export function useAgentStream(query: string | null) {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<StreamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  useEffect(() => {
    if (!query) return;
    let isActive = true;
    let usedFallback = false;
    reconnectAttemptsRef.current = 0;

    const cleanupActiveConnection = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    cleanupActiveConnection();

    setLoading(true);
    setResult(null);
    setStatus('');
    setStreamError(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

    const runFallbackSearch = async (reason: string) => {
      if (usedFallback || !isActive) return;
      usedFallback = true;
      cleanupActiveConnection();
      setStatus('Live stream interrupted. Retrying via HTTP endpoint...');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const res = await fetch(`${apiUrl}/api/search?user_id=demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!isActive) return;
        setResult({
          type: 'result',
          query: data.query ?? query,
          scored_products: data.scored_products ?? [],
          recommendation: data.recommendation ?? null,
          budget_miss: data.budget_miss ?? null,
          battle_contenders: data.battle_contenders ?? null,
          battle_report: data.battle_report ?? null,
          error: data.error ?? null,
        });
        setStreamError(reason);
        setLoading(false);
      } catch {
        if (!isActive) return;
        setStreamError('Connection to agent server failed. Is the API running?');
        setLoading(false);
      }
    };

    const armTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        runFallbackSearch('Live stream timed out. Loaded fallback response.');
      }, 30000);
    };

    const connectStream = () => {
      if (!isActive || usedFallback) return;

      const url = `${apiUrl}/api/search/stream?query=${encodeURIComponent(query)}`;
      const es = new EventSource(url);
      esRef.current = es;

      armTimeout();

      es.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          armTimeout();
          // Reset reconnect count on active message received
          reconnectAttemptsRef.current = 0;

          if (data.type === 'result') {
            setResult(data as StreamResult);
            setLoading(false);
            cleanupActiveConnection();
          } else if (data.type === 'error') {
            setStreamError(data.message);
            setStatus(data.message);
            setLoading(false);
            cleanupActiveConnection();
          } else if (data.type === 'status') {
            setStatus(data.message);
          }
        } catch {
          // non-JSON frame — ignore
        }
      };

      es.onerror = () => {
        if (!isActive || usedFallback) return;

        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }

        if (reconnectAttemptsRef.current < MAX_STREAM_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          const attempt = reconnectAttemptsRef.current;
          const backoff = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 300,
            MAX_RECONNECT_DELAY_MS
          );
          setStatus(`Reconnecting stream (attempt ${attempt}/${MAX_STREAM_RECONNECT_ATTEMPTS})...`);

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActive && !usedFallback) {
              connectStream();
            }
          }, backoff);
        } else {
          runFallbackSearch('Live stream disconnected after retries. Loaded fallback response.');
        }
      };
    };

    connectStream();

    return () => {
      isActive = false;
      cleanupActiveConnection();
    };
  }, [query]);

  return { status, result, loading, streamError };
}
