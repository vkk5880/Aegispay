'use client';

import React, { useState } from 'react';
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

  const handleShare = async () => {
    try {
      const payload = {
        query,
        winner: {
          title: recommendation.title,
          price: recommendation.price,
          source: recommendation.source,
          link: recommendation.link || '',
          score: recommendation.score ?? 0,
          justification: recommendation.justification || '',
          rating: recommendation.rating ?? 0,
          review_count: recommendation.review_count ?? 0,
        },
        total_compared: totalCompared,
        timestamp: new Date().toISOString(),
      };

      const jsonStr = JSON.stringify(payload);
      let b64 = '';
      if (typeof window !== 'undefined') {
        b64 = window.btoa(unescape(encodeURIComponent(jsonStr)));
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/share?d=${encodeURIComponent(b64)}`;

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setState('copied');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }

    setTimeout(() => setState('idle'), 2500);
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
