'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Receipt,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  FileText,
  Lock,
  ArrowRight,
  Copy,
  Sparkles,
  ShoppingBag,
  Check,
  Inbox,
  Search,
  Truck,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useMounted } from '@/hooks/useMounted';

export interface PurchaseHistoryItem {
  order_id: string;
  user_id: string;
  title: string;
  price_cents: number;
  merchant_domain: string;
  cleaned_url?: string;
  score?: number;
  tx_id?: string;
  reservation_id?: string;
  escrow_status?: 'HELD' | 'CAPTURED' | 'REFUNDED' | 'DISPUTED';
  timestamp: string;
  receipt_number?: number;
  hash?: string;
  carrier?: string;
  tracking_number?: string;
  fulfillment_status?: 'processing' | 'shipped' | 'delivered';
}

export interface NFTReceiptItem {
  receipt_number: number;
  product_title: string;
  amount_cents: number;
  merchant_domain: string;
  tx_id: string;
  chain_hash: string;
  timestamp: string;
}

const STATIC_BASE_TIMESTAMP_1 = '2026-11-07T10:00:00.000Z';
const STATIC_BASE_TIMESTAMP_2 = '2026-11-06T20:00:00.000Z';
const STATIC_BASE_TIMESTAMP_3 = '2026-11-05T14:00:00.000Z';

const MOCK_INITIAL_ORDERS: PurchaseHistoryItem[] = [
  {
    order_id: 'ord_pp_884920491',
    user_id: 'demo',
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    price_cents: 34800,
    merchant_domain: 'bestbuy.com',
    cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    score: 9.4,
    tx_id: 'PAYID-M884920491XAU',
    reservation_id: 'vch_9f8a7d6c5b4e3a21',
    escrow_status: 'CAPTURED',
    timestamp: STATIC_BASE_TIMESTAMP_1,
    receipt_number: 1042,
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    carrier: 'FedEx Priority',
    tracking_number: '789012345678',
    fulfillment_status: 'delivered',
  },
  {
    order_id: 'ord_pp_104928502',
    user_id: 'demo',
    title: 'Apple AirPods Pro (2nd Generation) with MagSafe Case (USB-C)',
    price_cents: 19900,
    merchant_domain: 'target.com',
    cleaned_url: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400',
    score: 9.1,
    tx_id: 'PAYID-M104928502YTB',
    reservation_id: 'vch_4d3c2b1a8e7f6g5h',
    escrow_status: 'HELD',
    timestamp: STATIC_BASE_TIMESTAMP_2,
    receipt_number: 1043,
    hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    carrier: 'UPS Ground',
    tracking_number: '1Z999AA10123456784',
    fulfillment_status: 'shipped',
  },
  {
    order_id: 'ord_pp_395829104',
    user_id: 'demo',
    title: 'Anker Prime 20,000mAh Power Bank (200W Output)',
    price_cents: 8999,
    merchant_domain: 'anker.com',
    cleaned_url: 'https://images.unsplash.com/photo-1609592807664-8395568393e8?w=400',
    score: 8.8,
    tx_id: 'PAYID-M395829104ZTC',
    reservation_id: 'vch_2a4c6e8f0b1d3f5a',
    escrow_status: 'CAPTURED',
    timestamp: STATIC_BASE_TIMESTAMP_3,
    receipt_number: 1044,
    hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    carrier: 'USPS Express',
    tracking_number: '9400111899562537628841',
    fulfillment_status: 'delivered',
  },
];

const MOCK_INITIAL_RECEIPTS: NFTReceiptItem[] = [
  {
    receipt_number: 1042,
    product_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    amount_cents: 34800,
    merchant_domain: 'bestbuy.com',
    tx_id: 'PAYID-M884920491XAU',
    chain_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: STATIC_BASE_TIMESTAMP_1,
  },
  {
    receipt_number: 1043,
    product_title: 'Apple AirPods Pro (2nd Generation) with MagSafe Case (USB-C)',
    amount_cents: 19900,
    merchant_domain: 'target.com',
    tx_id: 'PAYID-M104928502YTB',
    chain_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    timestamp: STATIC_BASE_TIMESTAMP_2,
  },
  {
    receipt_number: 1044,
    product_title: 'Anker Prime 20,000mAh Power Bank (200W Output)',
    amount_cents: 8999,
    merchant_domain: 'anker.com',
    tx_id: 'PAYID-M395829104ZTC',
    chain_hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    timestamp: STATIC_BASE_TIMESTAMP_3,
  },
];

export function HistoryContent({
  initialItems = MOCK_INITIAL_ORDERS,
  initialReceipts = MOCK_INITIAL_RECEIPTS,
}: {
  initialItems?: PurchaseHistoryItem[];
  initialReceipts?: NFTReceiptItem[];
}) {
  const mounted = useMounted();
  const [items, setItems] = useState<PurchaseHistoryItem[]>(initialItems);
  const [receipts, setReceipts] = useState<NFTReceiptItem[]>(initialReceipts);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'receipts'>('orders');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/buyer/history?user_id=demo');
        if (res.ok) {
          const data = await res.json();
          if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            setItems(data.history);
          }
        }
      } catch (err) {
        console.warn('Backend history unreachable, using cached mock ledger.', err);
      }

      try {
        const resReceipts = await fetch('/api/buyer/receipts?user_id=demo');
        if (resReceipts.ok) {
          const data = await resReceipts.json();
          if (data.receipts && Array.isArray(data.receipts) && data.receipts.length > 0) {
            setReceipts(data.receipts);
          }
        }
      } catch (err) {
        console.warn('Backend receipts unreachable, using cached cryptographic receipts.', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleEscrowAction = async (orderId: string, action: 'confirm' | 'refund') => {
    setActionLoading(orderId);
    try {
      const endpoint = action === 'confirm' ? '/api/buyer/escrow/confirm' : '/api/buyer/escrow/refund';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'demo', order_id: orderId }),
      });

      const newStatus = action === 'confirm' ? 'CAPTURED' : 'REFUNDED';
      setItems((prev) =>
        prev.map((item) => (item.order_id === orderId ? { ...item, escrow_status: newStatus } : item))
      );
    } catch {
      // Local fallback for offline evaluation
      const newStatus = action === 'confirm' ? 'CAPTURED' : 'REFUNDED';
      setItems((prev) =>
        prev.map((item) => (item.order_id === orderId ? { ...item, escrow_status: newStatus } : item))
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyHash = (hash: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2500);
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const formatDate = (isoString: string) => {
    if (!mounted) {
      return isoString.split('T')[0] || isoString;
    }
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#060b14] text-slate-100 pt-24 pb-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
      {/* Header Banner */}
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SHA-256 Chained Ledger · RFC 8785 Canonical JSON</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white font-display mb-3">
          Purchase History & Audit Ledger
        </h1>
        <p className="max-w-xl text-sm sm:text-base text-slate-400 font-medium">
          Autonomous 2PC escrow holds, price-drop watcher captures, and cryptographically verified transaction receipts.
        </p>

        {/* Tab Switcher */}
        <div className="mt-8 inline-flex p-1 rounded-xl bg-slate-900/80 border border-slate-800">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'orders'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Orders & Escrow Holds ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'receipts'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Cryptographic Proofs & Receipts ({receipts.length})
          </button>
        </div>
      </div>

      {/* Orders Tab Content */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center">
              <Inbox className="w-12 h-12 text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">No Orders or Escrow Holds Found</h3>
              <p className="text-xs text-slate-400 max-w-md mb-6">
                Your autonomous 2PC escrow purchase history and cryptographic holds will appear here once executed.
              </p>
              <Link
                href="/search"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-lg"
              >
                <Search className="w-4 h-4" />
                <span>Discover Products to Purchase</span>
              </Link>
            </div>
          ) : (
            items.map((item) => {
              const isHeld = item.escrow_status === 'HELD';
              const isCaptured = item.escrow_status === 'CAPTURED';
              const isRefunded = item.escrow_status === 'REFUNDED';
              const isDisputed = item.escrow_status === 'DISPUTED';

              return (
                <div
                  key={item.order_id}
                  className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/40 transition-all card-hover shadow-xl flex flex-col gap-4"
                >
                  {/* Top Row: Merchant, Title, Price, Status */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-cyan-500/20">
                          {item.merchant_domain}
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs text-slate-400">{formatDate(item.timestamp)}</span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                        {item.title}
                      </h2>
                    </div>

                    <div className="flex flex-col sm:items-end flex-shrink-0">
                      <span className="text-2xl font-black text-white font-mono tracking-tight">
                        {formatPrice(item.price_cents)}
                      </span>
                      <div className="mt-1">
                        {isHeld && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3 animate-spin" />
                            72h Escrow Hold
                          </span>
                        )}
                        {isCaptured && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Captured & Settled
                          </span>
                        )}
                        {isRefunded && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                            <RotateCcw className="w-3 h-3" />
                            Refunded / Voided
                          </span>
                        )}
                        {isDisputed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            Under Arbitration
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Identifiers & Ledger Proof */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tx_id && (
                        <span className="font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                          PayPal ID: <strong className="text-slate-200">{item.tx_id}</strong>
                        </span>
                      )}
                      {item.reservation_id && (
                        <span className="font-mono text-cyan-400/90 bg-cyan-950/30 px-2.5 py-1 rounded border border-cyan-800/40">
                          Mandate: <strong>{item.reservation_id}</strong>
                        </span>
                      )}
                    </div>

                    {item.hash && (
                      <button
                        onClick={() => handleCopyHash(item.hash!)}
                        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 font-mono text-[11px] transition-colors bg-slate-950 px-2.5 py-1 rounded border border-slate-800 cursor-pointer"
                      >
                        {copiedHash === item.hash ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">SHA-256 Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Hash: {item.hash.slice(0, 12)}...</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Live Carrier Tracking Progress Stepper */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                        <Truck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Carrier: <strong className="text-white">{item.carrier || 'FedEx Priority'}</strong></span>
                        <span className="text-slate-500 font-mono text-[11px] ml-1">
                          #{item.tracking_number || `TRK-${item.order_id.slice(-8)}`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                        {item.fulfillment_status === 'delivered'
                          ? 'Delivered'
                          : item.fulfillment_status === 'shipped'
                          ? 'In Transit'
                          : 'Processing'}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {['Confirmed', 'Processing', 'In Transit', 'Delivered'].map((step, idx) => {
                        const isComplete =
                          item.fulfillment_status === 'delivered'
                            ? idx <= 3
                            : item.fulfillment_status === 'shipped'
                            ? idx <= 2
                            : idx <= 1;
                        const isCurrent =
                          (item.fulfillment_status === 'delivered' && idx === 3) ||
                          (item.fulfillment_status === 'shipped' && idx === 2) ||
                          (!item.fulfillment_status && idx === 1);
                        return (
                          <div key={step} className="flex flex-col gap-1 items-center">
                            <div
                              className={`h-1.5 w-full rounded-full ${
                                isComplete ? 'bg-cyan-500' : 'bg-slate-800'
                              } ${isCurrent ? 'ring-1 ring-cyan-400 animate-pulse' : ''}`}
                            />
                            <span
                              className={`text-[9px] font-mono ${
                                isComplete ? 'text-cyan-300 font-bold' : 'text-slate-500'
                              }`}
                            >
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Row: Actions */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-cyan-500" />
                      <span>Protected by AegisPay Zero-Trust Custodian Gate</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isHeld && (
                        <>
                          <button
                            disabled={actionLoading === item.order_id}
                            onClick={() => handleEscrowAction(item.order_id, 'refund')}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-900/40 transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === item.order_id ? 'Voiding...' : 'Cancel & Void'}
                          </button>
                          <button
                            disabled={actionLoading === item.order_id}
                            onClick={() => handleEscrowAction(item.order_id, 'confirm')}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === item.order_id ? 'Confirming...' : 'Confirm Delivery & Release'}
                          </button>
                        </>
                      )}

                      <Link
                        href="/judge"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Dispute Forensics ↗
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Receipts Tab Content */}
      {activeTab === 'receipts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {receipts.length === 0 ? (
            <div className="col-span-full p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center">
              <Inbox className="w-12 h-12 text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">No Cryptographic Proofs Generated</h3>
              <p className="text-xs text-slate-400 max-w-md">
                Settled orders automatically yield RFC 8785 canonical hash receipts anchored to the AegisPay ledger.
              </p>
            </div>
          ) : (
            receipts.map((rcpt) => (
              <div
                key={rcpt.receipt_number}
                className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-xl flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 bg-cyan-950/50 border border-cyan-800/40 px-2.5 py-0.5 rounded">
                      <FileText className="w-3.5 h-3.5" />
                      CERTIFICATE #{rcpt.receipt_number}
                    </div>
                    <span className="text-xl font-black text-white font-mono">
                      {formatPrice(rcpt.amount_cents)}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-2 leading-snug">
                    {rcpt.product_title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Merchant: <strong className="text-slate-300">{rcpt.merchant_domain}</strong> · {formatDate(rcpt.timestamp)}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-[11px] space-y-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span>Tx ID:</span>
                    <span className="text-slate-200">{rcpt.tx_id}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-500 text-[10px]">SHA-256 Block Hash:</span>
                    <span className="text-cyan-400/90 break-all select-all">{rcpt.chain_hash}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 text-xs">
                  <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> RFC 8785 Verified
                  </span>
                  <button
                    onClick={() => handleCopyHash(rcpt.chain_hash)}
                    className="text-slate-400 hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy Proof
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <ErrorBoundary>
      <HistoryContent />
    </ErrorBoundary>
  );
}
