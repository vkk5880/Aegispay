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
} from 'lucide-react';

interface SharedProduct {
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

function ShareContent() {
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState<boolean>(false);
  const [winner, setWinner] = useState<SharedProduct>(DEFAULT_WINNER);
  const [runnerUp, setRunnerUp] = useState<SharedProduct>(DEFAULT_RUNNER_UP);
  const [query, setQuery] = useState<string>('Noise canceling studio headphones under $350');

  useEffect(() => {
    const dataParam = searchParams?.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(dataParam)));
        if (decoded.q) setQuery(decoded.q);
        if (decoded.w) {
          setWinner((prev) => ({
            ...prev,
            title: decoded.w.t || prev.title,
            price_cents: decoded.w.p || prev.price_cents,
            score: decoded.w.s || prev.score,
            merchant: decoded.w.m || prev.merchant,
          }));
        }
        if (decoded.r) {
          setRunnerUp((prev) => ({
            ...prev,
            title: decoded.r.t || prev.title,
            price_cents: decoded.r.p || prev.price_cents,
            score: decoded.r.s || prev.score,
            merchant: decoded.r.m || prev.merchant,
          }));
        }
      } catch (err) {
        console.warn('Unable to decode share payload, showing canonical battle dossier.', err);
      }
    }
  }, [searchParams]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.href);
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

  return (
    <div className="relative min-h-screen bg-[#060b14] text-slate-100 pt-20 pb-32 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-400">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>AegisPay Shared Decision Dossier · Referee Battle Verdict</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-display mb-3">
          AI Shopping Recommendation
        </h1>
        <p className="max-w-xl text-sm sm:text-base text-slate-400 font-medium">
          Deterministic head-to-head referee comparison for: <strong className="text-white">&ldquo;{query}&rdquo;</strong>
        </p>

        {/* Copy Share Button */}
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
                <span>Share Decision Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Head-to-Head Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-12">
        {/* Winner Card */}
        <div className="p-7 rounded-3xl bg-slate-900/80 border-2 border-cyan-500 shadow-2xl shadow-cyan-950/60 flex flex-col justify-between relative card-hover">
          <div className="absolute -top-3.5 left-8 px-4 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Referee Winner</span>
          </div>

          <div>
            <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-slate-950 mb-5 border border-slate-800">
              {winner.image_url && (
                <img
                  src={winner.image_url}
                  alt={winner.title}
                  className="w-full h-full object-cover object-center"
                />
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
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>1-Click Buy in AegisPay Cockpit</span>
            </Link>
          </div>
        </div>

        {/* Runner-Up Card */}
        <div className="p-7 rounded-3xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between relative card-hover opacity-90">
          <div className="absolute -top-3.5 left-8 px-4 py-1 rounded-full bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider border border-slate-700 flex items-center gap-1.5">
            <span>Runner Up Contender</span>
          </div>

          <div>
            <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-slate-950 mb-5 border border-slate-800">
              {runnerUp.image_url && (
                <img
                  src={runnerUp.image_url}
                  alt={runnerUp.title}
                  className="w-full h-full object-cover object-center"
                />
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
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2"
            >
              <span>Inspect in Cockpit</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060b14] text-white p-20 text-center font-mono text-sm animate-pulse">Loading Shared Recommendation...</div>}>
      <ShareContent />
    </Suspense>
  );
}
