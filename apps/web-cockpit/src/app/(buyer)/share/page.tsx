'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  Share2,
  Check,
  Star,
  ShoppingBag,
  ExternalLink,
  Sparkles,
  Trophy,
  ArrowRight,
  TrendingDown,
  Layers,
  Search,
  FileQuestion,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
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
    <div className="relative min-h-screen bg-[#060b14] text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-400">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>
            {showTechnicalDetails
              ? 'AegisPay Shared Decision Dossier · Referee Battle Verdict'
              : 'AegisPay Smart Comparison · Best Value Pick'}
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-display mb-3">
          AI Shopping Recommendation
        </h1>
        <p className="max-w-xl text-sm sm:text-base text-slate-400 font-medium">
          {showTechnicalDetails ? (
            <>
              Deterministic head-to-head referee comparison for:{' '}
              <strong className="text-white">&ldquo;{query}&rdquo;</strong>
            </>
          ) : (
            <>
              Side-by-side deal comparison for:{' '}
              <strong className="text-white">&ldquo;{query}&rdquo;</strong>
            </>
          )}
        </p>

        {/* Copy Share Button */}
        {hasData && (
          <div className="mt-5">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 hover:text-white hover:border-cyan-500 transition-all cursor-pointer shadow-lg"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Link Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{showTechnicalDetails ? 'Share Decision Link' : 'Share Comparison'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Head-to-Head Comparison Grid or Empty State */}
      {!hasData ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center">
          <FileQuestion className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">No Comparison Dossier Available</h3>
          <p className="text-xs text-slate-400 max-w-md mb-6">
            The decision link does not contain a valid battle payload. You can generate a new comparison by searching products in AegisPay.
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-lg"
          >
            <Search className="w-4 h-4" />
            <span>Search & Compare Products</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-12">
          {/* Winner Card */}
          {winner && (
            <div className="p-7 rounded-3xl bg-slate-900/80 border-2 border-cyan-500 shadow-2xl shadow-cyan-950/60 flex flex-col justify-between relative card-hover">
              <div className="absolute -top-3.5 left-8 px-4 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span>{showTechnicalDetails ? 'Referee Winner' : 'Top Recommendation'}</span>
              </div>

              <div>
                <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-slate-950 mb-5 border border-slate-800">
                  {winner.image_url ? (
                    <img
                      src={winner.image_url}
                      alt={winner.title}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                      <Sparkles className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-white font-mono font-black text-sm flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{winner.score.toFixed(1)} / 10</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-cyan-500/20">
                    {winner.merchant}
                  </span>
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                    13% Below MSRP
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white mb-2 leading-snug">
                  {winner.title}
                </h2>

                <p className="text-xs text-slate-300 leading-relaxed mb-6 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  {winner.reason}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between items-baseline mb-4">
                  <div>
                    <span className="text-3xl font-black text-white font-mono">
                      {formatPrice(winner.price_cents)}
                    </span>
                    {winner.compare_cents && (
                      <span className="ml-2 text-sm text-slate-500 line-through font-mono">
                        {formatPrice(winner.compare_cents)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-cyan-400 font-mono font-bold">Free Express Delivery</span>
                </div>

                <Link
                  href="/"
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
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
            <div className="p-7 rounded-3xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between relative card-hover opacity-90">
              <div className="absolute -top-3.5 left-8 px-4 py-1 rounded-full bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider border border-slate-700 flex items-center gap-1.5">
                <span>{showTechnicalDetails ? 'Runner Up Contender' : 'Runner-Up Alternative'}</span>
              </div>

              <div>
                <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-slate-950 mb-5 border border-slate-800">
                  {runnerUp.image_url ? (
                    <img
                      src={runnerUp.image_url}
                      alt={runnerUp.title}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                      <Sparkles className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-white font-mono font-black text-sm flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{runnerUp.score.toFixed(1)} / 10</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {runnerUp.merchant}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white mb-2 leading-snug">
                  {runnerUp.title}
                </h2>

                <p className="text-xs text-slate-400 leading-relaxed mb-6 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  {runnerUp.reason}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between items-baseline mb-4">
                  <div>
                    <span className="text-3xl font-black text-slate-300 font-mono">
                      {formatPrice(runnerUp.price_cents)}
                    </span>
                    {runnerUp.compare_cents && (
                      <span className="ml-2 text-sm text-slate-600 line-through font-mono">
                        {formatPrice(runnerUp.compare_cents)}
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href="/"
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
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

export default function SharePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-[#060b14] text-white p-20 text-center font-mono text-sm animate-pulse">Loading Shared Recommendation...</div>}>
        <ShareContent />
      </Suspense>
    </ErrorBoundary>
  );
}
