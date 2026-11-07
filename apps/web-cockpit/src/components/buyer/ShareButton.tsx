'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Share2, Check, AlertCircle } from 'lucide-react';

export interface ScoredProductShareLike {
  title: string;
  price: number;
  source: string;
  link?: string;
  score?: number;
  justification?: string;
  rating?: number;
  review_count?: number;
  community_sentiment?: string;
}

export interface ShareButtonProps {
  query: string;
  recommendation: ScoredProductShareLike;
  totalCompared: number;
  className?: string;
}

export function ShareButton({
  query,
  recommendation,
  totalCompared,
  className = '',
}: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const mountedRef = useRef<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copySafely = async (textToCopy: string): Promise<boolean> => {
    // 1. Try modern asynchronous Clipboard API if available and securely permitted
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(textToCopy);
        return true;
      } catch {
        // Fall back to execCommand if clipboard writeText fails (e.g., permissions or non-secure context)
      }
    }

    // 2. Fallback to textarea + document.execCommand('copy') in browser environments
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) return true;
      } catch {
        return false;
      }
    }

    return false;
  };

  const handleShare = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      const payload = {
        query: (query || '').trim(),
        winner: {
          title: recommendation?.title || '',
          price: typeof recommendation?.price === 'number' ? recommendation.price : 0,
          source: recommendation?.source || '',
          link: recommendation?.link || '',
          score: typeof recommendation?.score === 'number' ? recommendation.score : 0,
          justification: recommendation?.justification || '',
          rating: typeof recommendation?.rating === 'number' ? recommendation.rating : 0,
          review_count: typeof recommendation?.review_count === 'number' ? recommendation.review_count : 0,
        },
        total_compared: typeof totalCompared === 'number' ? totalCompared : 0,
        timestamp: new Date().toISOString(),
      };

      const jsonStr = JSON.stringify(payload);
      let b64 = '';
      if (typeof window !== 'undefined') {
        b64 = window.btoa(unescape(encodeURIComponent(jsonStr)));
      }

      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
      const url = `${origin}/share?d=${encodeURIComponent(b64)}`;

      const copied = await copySafely(url);
      if (mountedRef.current) {
        setState(copied ? 'copied' : 'error');
      }
    } catch {
      if (mountedRef.current) {
        setState('error');
      }
    }

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setState('idle');
      }
    }, 2500);
  };

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono border transition-all duration-150 cursor-pointer ${
        state === 'copied'
          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
          : state === 'error'
          ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          : 'bg-slate-900/80 border-cyan-500/30 text-slate-300 hover:text-white hover:border-cyan-400 hover:bg-slate-800'
      } ${className}`}
      aria-label="Share comparison decision link"
    >
      {state === 'copied' ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Link Copied</span>
        </>
      ) : state === 'error' ? (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          <span>Copy Failed</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Share Result</span>
        </>
      )}
    </button>
  );
}
