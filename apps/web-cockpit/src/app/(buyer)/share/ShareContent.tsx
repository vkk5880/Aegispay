'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Share2,
  Check,
  Star,
  ShoppingBag,
  Sparkles,
  Trophy,
  Search,
  FileQuestion,
} from 'lucide-react';
import { useMounted } from '@/hooks/useMounted';
import { useUiMode } from '@/context/UiModeContext';

export interface SharedProduct {
  title: string;
  price_cents: number;
  compare_cents?: number;
  score: number;
  merchant: string;
  image_url?: string;
  reason: string;
}

const DEFAULT_WINNER: SharedProduct = {
  title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones',
  price_cents: 34800,
  compare_cents: 39999,
  score: 9.4,
  merchant: 'bestbuy.com',
  image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
  reason: 'Superior active noise cancellation (Dual V1+QN1 chips) and industry-highest battery efficiency. 13% below MSRP with waived shipping.',
};

const DEFAULT_RUNNER_UP: SharedProduct = {
  title: 'Bose QuietComfort Ultra Wireless Headphones',
  price_cents: 37900,
  compare_cents: 42900,
  score: 9.1,
  merchant: 'amazon.com',
  image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80',
  reason: 'Breakthrough spatial audio and plush comfort, but carries a higher unit price and 40% lower battery duration compared to Sony.',
};

export function ShareContent({
  initialWinner = DEFAULT_WINNER,
  initialRunnerUp = DEFAULT_RUNNER_UP,
  initialQuery = 'Noise canceling studio headphones under $350',
}: {
  initialWinner?: SharedProduct | null;
  initialRunnerUp?: SharedProduct | null;
  initialQuery?: string;
}) {
  const searchParams = useSearchParams();
  const mounted = useMounted();
  const { showTechnicalDetails } = useUiMode();
  const [copied, setCopied] = useState<boolean>(false);
  const [winner, setWinner] = useState<SharedProduct | null>(initialWinner);
  const [runnerUp, setRunnerUp] = useState<SharedProduct | null>(initialRunnerUp);
  const [query, setQuery] = useState<string>(initialQuery);

  useEffect(() => {
    const dataParam = searchParams?.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(dataParam)));
        if (decoded.q) setQuery(decoded.q);
        if (decoded.w) {
          setWinner((prev) => ({
            title: decoded.w.t || prev?.title || 'Unknown Product',
            price_cents: decoded.w.p ?? prev?.price_cents ?? 0,
            score: decoded.w.s ?? prev?.score ?? 9.0,
            merchant: decoded.w.m || prev?.merchant || 'merchant.com',
            image_url: prev?.image_url,
            reason: prev?.reason || 'Verified deterministic winner by composite scoring.',
          }));
        }
        if (decoded.r) {
          setRunnerUp((prev) => ({
            title: decoded.r.t || prev?.title || 'Unknown Product',
            price_cents: decoded.r.p ?? prev?.price_cents ?? 0,
            score: decoded.r.s ?? prev?.score ?? 8.5,
            merchant: decoded.r.m || prev?.merchant || 'merchant.com',
            image_url: prev?.image_url,
            reason: prev?.reason || 'Strong competitor based on technical specs and merchant reputation.',
          }));
        }
      } catch (err) {
        console.warn('Unable to decode share payload, showing canonical battle dossier.', err);
      }
    }
  }, [searchParams]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const hasData = Boolean(winner || runnerUp);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full transition-colors">
      {/* Header */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          <span>
            {showTechnicalDetails
              ? 'AegisPay Shared Decision Dossier · Referee Battle Verdict'
              : 'AegisPay Smart Comparison · Best Value Pick'}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display mb-2">
          AI Shopping Recommendation
        </h1>
        <p className="max-w-xl text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          {showTechnicalDetails ? (
            <>
              Deterministic head-to-head referee comparison for:{' '}
              <strong className="text-slate-900 dark:text-white">&ldquo;{query}&rdquo;</strong>
            </>
          ) : (
            <>
              Side-by-side deal comparison for:{' '}
              <strong className="text-slate-900 dark:text-white">&ldquo;{query}&rdquo;</strong>
            </>
          )}
        </p>

        {/* Copy Share Button */}
        {hasData && (
          <div className="mt-4">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:border-cyan-500 transition-all cursor-pointer shadow-2xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>{showTechnicalDetails ? 'Share Decision Link' : 'Share Comparison'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Head-to-Head Comparison Grid or Empty State */}
      {!hasData ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center shadow-xs">
          <FileQuestion className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Comparison Dossier Available</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6">
            The decision link does not contain a valid battle payload. You can generate a new comparison by searching products in AegisPay.
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md"
          >
            <Search className="w-4 h-4" />
            <span>Search & Compare Products</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch mb-12">
          {/* Winner Card */}
          {winner && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900/80 border-2 border-cyan-500 shadow-md shadow-cyan-500/10 flex flex-col justify-between relative card-hover">
              <div className="absolute -top-3 left-6 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider shadow-md flex items-center gap-1.5">
                <Trophy className="w-3 h-3 text-amber-300" />
                <span>{showTechnicalDetails ? 'Referee Winner' : 'Top Recommendation'}</span>
              </div>

              <div>
                <div className="relative w-full h-40 sm:h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 mb-3.5 border border-slate-200 dark:border-slate-800">
                  {winner.image_url ? (
                    <img
                      src={winner.image_url}
                      alt={winner.title}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-400">
                      <Sparkles className="w-7 h-7" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-white/90 dark:bg-black/85 backdrop-blur-md border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white font-mono font-black text-xs flex items-center gap-1 shadow-2xs">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{winner.score.toFixed(1)} / 10</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                    {winner.merchant}
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 rounded">
                    13% Below MSRP
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5 leading-snug">
                  {winner.title}
                </h2>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  {winner.reason}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-baseline mb-3">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
                      {formatPrice(winner.price_cents)}
                    </span>
                    {winner.compare_cents && (
                      <span className="ml-2 text-xs sm:text-sm text-slate-400 line-through font-mono">
                        {formatPrice(winner.compare_cents)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-cyan-700 dark:text-cyan-400 font-mono font-bold">Free Express Delivery</span>
                </div>

                <Link
                  href="/"
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>
                    {showTechnicalDetails
                      ? '1-Click Buy in AegisPay Cockpit'
                      : '1-Click Buy with PayPal'}
                  </span>
                </Link>
              </div>
            </div>
          )}

          {/* Runner-Up Card */}
          {runnerUp && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between relative card-hover shadow-xs">
              <div className="absolute -top-3 left-6 px-3.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] uppercase tracking-wider border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                <span>{showTechnicalDetails ? 'Runner Up Contender' : 'Runner-Up Alternative'}</span>
              </div>

              <div>
                <div className="relative w-full h-40 sm:h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 mb-3.5 border border-slate-200 dark:border-slate-800">
                  {runnerUp.image_url ? (
                    <img
                      src={runnerUp.image_url}
                      alt={runnerUp.title}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-400">
                      <Sparkles className="w-7 h-7" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-white/90 dark:bg-black/85 backdrop-blur-md border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white font-mono font-black text-xs flex items-center gap-1 shadow-2xs">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{runnerUp.score.toFixed(1)} / 10</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {runnerUp.merchant}
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5 leading-snug">
                  {runnerUp.title}
                </h2>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  {runnerUp.reason}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-baseline mb-3">
                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-300 font-mono">
                      {formatPrice(runnerUp.price_cents)}
                    </span>
                    {runnerUp.compare_cents && (
                      <span className="ml-2 text-xs sm:text-sm text-slate-400 line-through font-mono">
                        {formatPrice(runnerUp.compare_cents)}
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href="/"
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span>{showTechnicalDetails ? 'Inspect in Cockpit' : 'View in Shop'}</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
