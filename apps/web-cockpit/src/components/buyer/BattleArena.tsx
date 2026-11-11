'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Trophy,
  Swords,
  Scale,
  Star,
  CheckCircle2,
  ExternalLink,
  ShoppingBag,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import type { ProductCardData } from '@aegispay/shared-types';

export interface BattleArenaProps {
  contenders: (ProductCardData | Record<string, any>)[];
  battleReport?: string | null;
  winner?: (ProductCardData | Record<string, any>) | null;
  onSelectWinner?: (winner: any) => void;
}

/**
 * Safely parses product price into dollars with zero NaN guarantee.
 */
export function extractProductPrice(product: any): number {
  if (!product) return 0;
  if (typeof product.price_cents === 'number' && !Number.isNaN(product.price_cents)) {
    return Math.max(0, product.price_cents / 100);
  }
  if (typeof product.price === 'number' && !Number.isNaN(product.price)) {
    return Math.max(0, product.price > 1000 ? product.price / 100 : product.price);
  }
  const parsed = parseFloat(product.price || product.price_cents || 0);
  return Number.isNaN(parsed) || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * Safely normalizes score to an integer percentage [0, 100] with zero NaN guarantee.
 */
export function extractProductScore(product: any): number {
  if (!product) return 90;
  let scoreVal: number | undefined;

  if (typeof product.composite_score === 'number' && !Number.isNaN(product.composite_score)) {
    scoreVal = product.composite_score <= 10 ? product.composite_score * 10 : product.composite_score;
  } else if (typeof product.score === 'number' && !Number.isNaN(product.score)) {
    scoreVal = product.score <= 1 ? product.score * 100 : product.score;
  }

  if (scoreVal === undefined || Number.isNaN(scoreVal) || !Number.isFinite(scoreVal)) {
    return 90;
  }

  return Math.round(Math.min(100, Math.max(0, scoreVal)));
}

/**
 * Calculates head-to-head metric deltas between contender A and B with zero NaN guarantee.
 */
export interface MetricDeltas {
  priceDelta: number; // A - B in dollars
  scoreDelta: number; // A - B in percentage points
  priceDiffText: string;
  scoreDiffText: string;
  cheaperSide: 'A' | 'B' | 'EQUAL';
  higherScoreSide: 'A' | 'B' | 'EQUAL';
}

export function calculateMetricDeltas(a: any, b: any): MetricDeltas {
  const priceA = extractProductPrice(a);
  const priceB = extractProductPrice(b);
  const scoreA = extractProductScore(a);
  const scoreB = extractProductScore(b);

  const rawPriceDelta = priceA - priceB;
  const priceDelta = Number.isNaN(rawPriceDelta) || !Number.isFinite(rawPriceDelta) ? 0 : rawPriceDelta;

  const rawScoreDelta = scoreA - scoreB;
  const scoreDelta = Number.isNaN(rawScoreDelta) || !Number.isFinite(rawScoreDelta) ? 0 : rawScoreDelta;

  const cheaperSide: 'A' | 'B' | 'EQUAL' =
    Math.abs(priceDelta) < 0.001 ? 'EQUAL' : priceDelta < 0 ? 'A' : 'B';
  const higherScoreSide: 'A' | 'B' | 'EQUAL' =
    scoreDelta === 0 ? 'EQUAL' : scoreDelta > 0 ? 'A' : 'B';

  const absPriceDelta = Math.abs(priceDelta).toFixed(2);
  const absScoreDelta = Math.abs(scoreDelta);

  const priceDiffText =
    cheaperSide === 'EQUAL'
      ? 'Identical Price'
      : cheaperSide === 'A'
      ? `Side A is $${absPriceDelta} cheaper`
      : `Side B is $${absPriceDelta} cheaper`;

  const scoreDiffText =
    higherScoreSide === 'EQUAL'
      ? 'Equal Score'
      : higherScoreSide === 'A'
      ? `Side A leads by +${absScoreDelta}%`
      : `Side B leads by +${absScoreDelta}%`;

  return {
    priceDelta,
    scoreDelta,
    priceDiffText,
    scoreDiffText,
    cheaperSide,
    higherScoreSide,
  };
}

function useTypewriter(text: string | null | undefined, speed = 16): string {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const textRef = useRef(text);

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      return;
    }
    if (textRef.current !== text) {
      textRef.current = text;
      indexRef.current = 0;
      setDisplayed('');
    }
    const interval = setInterval(() => {
      if (indexRef.current < (text?.length ?? 0)) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return displayed;
}

function ContenderCard({
  product,
  side,
  isWinner,
  isRevealed,
  onSelect,
}: {
  product: any;
  side: 'A' | 'B';
  isWinner: boolean;
  isRevealed: boolean;
  onSelect?: () => void;
}) {
  const price = extractProductPrice(product);
  const score = extractProductScore(product);
  const merchant = product.merchant_domain || product.source || 'Verified Store';
  const title = product.title || 'Product Offer';
  const img = product.cleaned_url || product.image_url;

  return (
    <div
      className={`relative flex flex-col justify-between rounded-xl p-3 sm:p-4 flex-1 min-w-0 transition-all duration-300 ${
        isRevealed && isWinner
          ? 'bg-cyan-50/80 dark:bg-cyan-950/40 border-2 border-cyan-500 shadow-md shadow-cyan-500/10 dark:shadow-cyan-950/60'
          : isRevealed
          ? 'bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 opacity-80'
          : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Winner Crown */}
      {isRevealed && isWinner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow-md flex items-center gap-1 z-10 animate-bounce">
          <Trophy className="w-3 h-3 text-amber-300" />
          <span>Referee Winner</span>
        </div>
      )}

      <div>
        {/* Compact Image & Score Badge */}
        <div className="relative w-full h-28 sm:h-32 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-950 mb-2.5 border border-slate-200 dark:border-slate-800">
          {img && (
            <img
              src={img}
              alt={title}
              className="w-full h-full object-cover object-center"
            />
          )}
          <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-white/90 dark:bg-black/85 backdrop-blur-md border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white font-mono font-black text-[11px] flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>{score}%</span>
          </div>
        </div>

        {/* Store Badge */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
            {merchant}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Side {side}</span>
        </div>

        {/* Title */}
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-2 leading-snug line-clamp-2">
          {title}
        </h3>

        {/* Price */}
        <div className="mb-2">
          <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
            ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Score Bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-slate-500 dark:text-slate-400">Score</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">{score}%</span>
          </div>
          <div
            className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${title} algorithmic score: ${score}%`}
          >
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isWinner ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-slate-400 dark:bg-slate-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
      </div>

      {onSelect && isWinner && (
        <button
          onClick={onSelect}
          aria-label={`Pre-authorize ${title} as winner`}
          className="w-full py-1.5 px-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Pre-Authorize Winner</span>
        </button>
      )}
    </div>
  );
}

export function BattleArena({
  contenders,
  battleReport,
  winner,
  onSelectWinner,
}: BattleArenaProps) {
  const [reportReady, setReportReady] = useState<boolean>(false);
  const [revealed, setRevealed] = useState<boolean>(false);

  const typedReport = useTypewriter(reportReady ? battleReport : null, 16);

  const a = contenders?.[0];
  const b = contenders?.[1];
  const winnerTitle = winner?.title ?? a?.title;
  const deltas = a && b ? calculateMetricDeltas(a, b) : null;

  useEffect(() => {
    const t1 = setTimeout(() => setReportReady(true), 400);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (!battleReport || !reportReady) return;
    const delay = battleReport.length * 16 + 300;
    const t2 = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(t2);
  }, [battleReport, reportReady]);

  if (!a || !b) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl mb-4 bg-white dark:bg-[#0c1424]/90 border border-slate-200/90 dark:border-white/10 shadow-md transition-all">
      {/* Top Gradient Line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />

      {/* Header with Small Comparison Icon */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-cyan-700 dark:text-cyan-400">
            Battle Arena · Side-by-Side Comparison
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">Autonomous LLM Arbiter</span>
      </div>

      {/* Contenders Side-by-Side */}
      <div className="flex flex-col sm:flex-row items-stretch gap-2.5 sm:gap-3 p-3 sm:p-4">
        <ContenderCard
          product={a}
          side="A"
          isWinner={revealed && a.title === winnerTitle}
          isRevealed={revealed}
          onSelect={() => onSelectWinner?.(a)}
        />

        {/* Small Comparison Center Badge with Deltas */}
        <div className="flex sm:flex-col items-center justify-center shrink-0 gap-1.5 my-1 sm:my-0 px-1">
          <div className="w-7 h-7 rounded-full bg-cyan-100 dark:bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center font-black text-[11px] text-cyan-700 dark:text-cyan-300 shadow-xs">
            <Scale className="w-3.5 h-3.5" />
          </div>
          {deltas && (
            <div className="flex sm:flex-col items-center gap-1 text-[9px] font-mono text-center">
              <span className={`px-1.5 py-0.5 rounded-full border ${
                deltas.cheaperSide === 'EQUAL'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
              }`}>
                {deltas.priceDiffText}
              </span>
              <span className={`px-1.5 py-0.5 rounded-full border ${
                deltas.higherScoreSide === 'EQUAL'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  : 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30'
              }`}>
                {deltas.scoreDiffText}
              </span>
            </div>
          )}
        </div>

        <ContenderCard
          product={b}
          side="B"
          isWinner={revealed && b.title === winnerTitle}
          isRevealed={revealed}
          onSelect={() => onSelectWinner?.(b)}
        />
      </div>

      {/* Referee Report */}
      {battleReport && (
        <div className="mx-3.5 sm:mx-4 mb-3.5 sm:mb-4 rounded-xl p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Referee&apos;s Declarative Verdict</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
            {typedReport}
            {typedReport.length < battleReport.length && (
              <span className="inline-block w-1.5 h-3.5 ml-1 bg-cyan-500 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
