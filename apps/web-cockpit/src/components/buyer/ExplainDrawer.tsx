'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, AlertCircle, X } from 'lucide-react';

export interface ProductLike {
  title: string;
  price: number;
  rating?: number;
  review_count?: number;
  score_breakdown?: {
    price_score?: number;
    rating_score?: number;
    review_score?: number;
  };
  relevance_score?: number;
  trust_multiplier?: number;
  trust_tier?: string;
  price_suspicious?: boolean;
}

export interface ExplainDrawerProps {
  product: ProductLike;
  allProducts: ProductLike[];
  isWinner?: boolean;
  open: boolean;
  onClose: () => void;
}

interface LoserReason {
  primary: string;
  stats: string[];
}

function getLosingReason(loser: ProductLike, winner: ProductLike): LoserReason {
  const priceDiff = loser.price - winner.price;
  const ratingDiff = (loser.rating ?? 0) - (winner.rating ?? 0);
  const reviewDiff = (loser.review_count ?? 0) - (winner.review_count ?? 0);

  let primary = 'Lower overall composite score';
  if (priceDiff > 5000) primary = `$${(priceDiff / 100).toFixed(2)} higher than winner`;
  else if ((loser.review_count ?? 0) < 50) primary = `Low confidence: only ${loser.review_count ?? 0} reviews`;
  else if ((loser.relevance_score ?? 0) < 0.4) primary = 'Poor semantic query match (< 40%)';
  else if (loser.trust_tier === 'tier3' || loser.trust_tier === 'unknown') primary = 'Unverified store trust tier';
  else if (loser.price_suspicious) primary = 'Anomaly detected (> 35% median price drop)';

  const stats: string[] = [];
  if (priceDiff !== 0) {
    stats.push(
      `Price: $${(winner.price / 100).toFixed(2)} vs $${(loser.price / 100).toFixed(2)} (${
        priceDiff > 0 ? '+' : ''
      }$${(priceDiff / 100).toFixed(2)})`
    );
  }
  if (ratingDiff !== 0) {
    stats.push(
      `Rating: ${winner.rating ?? 'N/A'} vs ${loser.rating ?? 'N/A'} (${
        ratingDiff > 0 ? '+' : ''
      }${ratingDiff.toFixed(1)})`
    );
  }
  if (reviewDiff !== 0) {
    stats.push(
      `Reviews: ${winner.review_count ?? 0} vs ${loser.review_count ?? 0} (${
        reviewDiff > 0 ? '+' : ''
      }${reviewDiff})`
    );
  }

  return { primary, stats };
}

export function ExplainDrawer({
  product,
  allProducts,
  isWinner = false,
  open,
  onClose,
}: ExplainDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'competitors'>('overview');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !product || !allProducts) return null;

  const validProducts = allProducts.filter((p) => p.score_breakdown);
  const avgScores = {
    price:
      validProducts.reduce((acc, p) => acc + (p.score_breakdown?.price_score ?? 0), 0) /
      (validProducts.length || 1),
    rating:
      validProducts.reduce((acc, p) => acc + (p.score_breakdown?.rating_score ?? 0), 0) /
      (validProducts.length || 1),
    reviews:
      validProducts.reduce((acc, p) => acc + (p.score_breakdown?.review_score ?? 0), 0) /
      (validProducts.length || 1),
    relevance:
      validProducts.reduce((acc, p) => acc + (p.relevance_score ?? 0), 0) /
      (validProducts.length || 1),
  };

  const chartData = [
    { label: 'Price', val: (product.score_breakdown?.price_score ?? 0), avg: avgScores.price },
    { label: 'Rating', val: (product.score_breakdown?.rating_score ?? 0), avg: avgScores.rating },
    { label: 'Reviews', val: (product.score_breakdown?.review_score ?? 0), avg: avgScores.reviews },
    { label: 'Relevance', val: (product.relevance_score ?? 0), avg: avgScores.relevance },
    { label: 'Trust', val: (product.trust_multiplier ?? 1), avg: 0.95 },
  ];

  // Pure SVG Radar Chart Geometry
  const size = 260;
  const center = size / 2;
  const radius = size * 0.38;
  const totalAxes = chartData.length;

  const getCoordinates = (index: number, normalizedValue: number) => {
    const angle = (Math.PI * 2 / totalAxes) * index - Math.PI / 2;
    const r = radius * Math.min(Math.max(normalizedValue, 0.05), 1);
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, angle };
  };

  const productPoints = chartData.map((d, i) => getCoordinates(i, d.val));
  const avgPoints = chartData.map((d, i) => getCoordinates(i, d.avg));

  const productPolygon = productPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const avgPolygon = avgPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const losers = allProducts.filter((p) => p.title !== product.title).slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="explain-drawer-title"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-md transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl mx-auto overflow-y-auto rounded-t-3xl border-t border-cyan-500/30 bg-[#060b14] p-6 sm:p-8 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-700" />

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="explain-drawer-title"
            className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-wide text-white"
          >
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span>Why {product.title.length > 35 ? product.title.slice(0, 35) + '…' : product.title}?</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Bar */}
        {isWinner && (
          <div className="mb-6 flex space-x-6 border-b border-slate-800 text-xs font-mono tracking-wider uppercase">
            <button
              className={`pb-2.5 font-bold transition-colors ${
                activeTab === 'overview'
                  ? 'border-b-2 border-cyan-400 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setActiveTab('overview')}
            >
              Deterministic Radar
            </button>
            <button
              className={`pb-2.5 font-bold transition-colors ${
                activeTab === 'competitors'
                  ? 'border-b-2 border-cyan-400 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setActiveTab('competitors')}
            >
              Why Others Lost ({losers.length})
            </button>
          </div>
        )}

        {/* Radar Chart View */}
        {(!isWinner || activeTab === 'overview') && (
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative w-[280px] h-[280px]">
              <svg width={size} height={size} className="overflow-visible">
                {/* Concentric polygon web rings */}
                {[0.25, 0.5, 0.75, 1.0].map((ringLevel) => {
                  const ringPoints = chartData
                    .map((_, i) => getCoordinates(i, ringLevel))
                    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                    .join(' ');
                  return (
                    <polygon
                      key={ringLevel}
                      points={ringPoints}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.15)"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Axes lines from center */}
                {chartData.map((d, i) => {
                  const edge = getCoordinates(i, 1.0);
                  const labelEdge = getCoordinates(i, 1.22);
                  return (
                    <g key={d.label}>
                      <line
                        x1={center}
                        y1={center}
                        x2={edge.x}
                        y2={edge.y}
                        stroke="rgba(148, 163, 184, 0.2)"
                        strokeWidth="1"
                      />
                      <text
                        x={labelEdge.x}
                        y={labelEdge.y}
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}

                {/* Average polygon */}
                <polygon
                  points={avgPolygon}
                  fill="rgba(148, 163, 184, 0.1)"
                  stroke="rgba(148, 163, 184, 0.4)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />

                {/* Product winner polygon */}
                <polygon
                  points={productPolygon}
                  fill="rgba(6, 182, 212, 0.25)"
                  stroke="#22d3ee"
                  strokeWidth="2.5"
                />

                {/* Data point dots */}
                {productPoints.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill="#22d3ee"
                    stroke="#060b14"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            </div>

            {/* Radar Legend */}
            <div className="mt-4 flex items-center justify-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                <span className="text-cyan-300 font-bold">This Product Vector</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-dashed border-slate-400" />
                <span className="text-slate-400">Batch Average</span>
              </div>
            </div>
          </div>
        )}

        {/* Competitor Elimination View */}
        {isWinner && activeTab === 'competitors' && (
          <div className="flex flex-col gap-3">
            {losers.map((loser, i) => {
              const reason = getLosingReason(loser, product);
              return (
                <div
                  key={i}
                  className="flex items-start gap-3.5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-all hover:border-slate-700"
                >
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate mb-1">
                      {loser.title}
                    </h4>
                    <p className="text-xs font-mono font-bold text-rose-400 mb-2.5">
                      {reason.primary}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {reason.stats.map((stat) => (
                        <span
                          key={stat}
                          className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] font-mono text-slate-400"
                        >
                          {stat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
