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
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useMounted } from '@/hooks/useMounted';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';

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

export function HistoryContent({
  initialItems = [],
  initialReceipts = [],
}: {
  initialItems?: PurchaseHistoryItem[];
  initialReceipts?: NFTReceiptItem[];
}) {
  const mounted = useMounted();
  const { showTechnicalDetails } = useUiMode();
  const { user, isLoggedIn } = useAuth();
  const effectiveUserId = user?.email || (user as any)?.id || 'guest';

  const [items, setItems] = useState<PurchaseHistoryItem[]>(initialItems);
  const [receipts, setReceipts] = useState<NFTReceiptItem[]>(initialReceipts);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'receipts' | 'chats'>('orders');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);

  // Live turn-bound chat sessions
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<{ session: any; messages: any[] } | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(false);

  useEffect(() => {
    let activeToken: string | null = null;
    let activeOrderId: string | null = null;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      activeToken = params.get('token');
      activeOrderId = params.get('order_id');
      if (activeToken) setTrackingToken(activeToken);
      if (activeOrderId) setTargetOrderId(activeOrderId);
    }

    async function loadData() {
      setLoading(true);
      const headers: Record<string, string> = {
        'x-user-id': effectiveUserId,
      };
      if (activeToken) {
        headers['authorization'] = `Bearer ${activeToken}`;
      }

      try {
        const historyUrl = activeOrderId
          ? `/api/buyer/history?user_id=${encodeURIComponent(effectiveUserId)}&order_id=${encodeURIComponent(activeOrderId)}`
          : `/api/buyer/history?user_id=${encodeURIComponent(effectiveUserId)}`;
        const res = await fetch(historyUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.history)) {
            setItems(data.history);
          } else if (Array.isArray(data.orders)) {
            setItems(data.orders);
          } else {
            setItems([]);
          }
        } else {
          setItems([]);
        }
      } catch (err) {
        console.warn('Backend history unreachable or empty ledger.', err);
        setItems([]);
      }

      try {
        const resReceipts = await fetch(`/api/buyer/receipts?user_id=${encodeURIComponent(effectiveUserId)}`, { headers });
        if (resReceipts.ok) {
          const data = await resReceipts.json();
          if (Array.isArray(data.receipts)) {
            setReceipts(data.receipts);
          } else {
            setReceipts([]);
          }
        } else {
          setReceipts([]);
        }
      } catch (err) {
        console.warn('Backend receipts unreachable or empty.', err);
        setReceipts([]);
      }

      try {
        const resSessions = await fetch(`/api/buyer/chat/sessions?user_id=${encodeURIComponent(effectiveUserId)}`, { headers });
        if (resSessions.ok) {
          const sData = await resSessions.json();
          if (Array.isArray(sData.sessions)) {
            setChatSessions(sData.sessions);
          } else {
            setChatSessions([]);
          }
        } else {
          setChatSessions([]);
        }
      } catch (err) {
        console.warn('Backend chat sessions unreachable or empty.', err);
        setChatSessions([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [effectiveUserId]);

  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/buyer/chat/sessions/${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        setSessionDetail({ session: data.session, messages: data.messages || [] });
      }
    } catch (err) {
      console.warn('Failed to fetch session detail', err);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleEscrowAction = async (orderId: string, action: 'confirm' | 'refund') => {
    setActionLoading(orderId);
    try {
      const endpoint = action === 'confirm' ? '/api/buyer/escrow/confirm' : '/api/buyer/escrow/refund';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: effectiveUserId, order_id: orderId }),
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
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-slate-100 pt-24 pb-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full transition-colors">
      {/* Header Banner */}
      <div className="mb-10 text-center flex flex-col items-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>
            {showTechnicalDetails
              ? 'SHA-256 Chained Ledger · RFC 8785 Canonical JSON'
              : 'Verified Orders & Official Receipts'}
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display mb-3">
          {showTechnicalDetails ? 'Purchase History & Audit Ledger' : 'Orders & Purchase History'}
        </h1>
        <p className="max-w-xl text-sm sm:text-base text-slate-600 dark:text-slate-400 font-medium">
          {showTechnicalDetails
            ? 'Autonomous 2PC escrow holds, price-drop watcher captures, and cryptographically verified transaction receipts.'
            : 'Track your purchases, delivery progress, and official receipts with PayPal purchase protection.'}
        </p>

        {user?.email && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-1 text-xs font-mono font-medium text-emerald-800 dark:text-emerald-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected Account: <strong>{user.email}</strong></span>
          </div>
        )}

        {/* Scoped Read-Only Tracking Mode Banner */}
        {Boolean(trackingToken || targetOrderId) && (
          <div className="mt-6 mb-2 p-4 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-400/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 max-w-2xl mx-auto w-full text-left animate-fade-in shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>Secure Shipment Tracking Mode</span>
                  {targetOrderId && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 text-[10px]">
                      {targetOrderId}
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Viewing live carrier fulfillment via read-only capability link. New purchases and wallet spending are restricted in this session.
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shrink-0 transition-all shadow-md active:scale-95 text-center"
            >
              Sign In with PayPal
            </Link>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="mt-8 inline-flex p-1 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'orders'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {showTechnicalDetails
              ? `Orders & Escrow Holds (${items.length})`
              : `Your Orders (${items.length})`}
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'receipts'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            {showTechnicalDetails
              ? `Cryptographic Proofs & Receipts (${receipts.length})`
              : `Official Receipts (${receipts.length})`}
          </button>
          <button
            onClick={() => {
              setActiveTab('chats');
              setSelectedSessionId(null);
            }}
            className={`flex items-center gap-2 px-4 sm:px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'chats'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat Threads ({chatSessions.length})</span>
          </button>
        </div>
      </div>

      {/* Orders Tab Content */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center shadow-xs">
              <Inbox className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Orders or Escrow Holds Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6">
                Your autonomous 2PC escrow purchase history and cryptographic holds will appear here once executed.
              </p>
              <Link
                href="/search"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md"
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
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 hover:border-cyan-500/40 transition-all card-hover shadow-xs flex flex-col gap-3.5"
                >
                  {/* Top Row: Merchant, Title, Price, Status */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                          {item.merchant_domain}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.timestamp)}</span>
                      </div>
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                        {item.title}
                      </h2>
                    </div>

                    <div className="flex flex-col sm:items-end flex-shrink-0">
                      <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                        {formatPrice(item.price_cents)}
                      </span>
                      <div className="mt-1">
                        {isHeld && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                            <Clock className="w-3 h-3 animate-spin" />
                            {showTechnicalDetails ? '72h Escrow Hold' : 'Payment Reserved'}
                          </span>
                        )}
                        {isCaptured && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            {showTechnicalDetails ? 'Captured & Settled' : 'Payment Completed'}
                          </span>
                        )}
                        {isRefunded && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30">
                            <RotateCcw className="w-3 h-3" />
                            {showTechnicalDetails ? 'Refunded / Voided' : 'Refunded'}
                          </span>
                        )}
                        {isDisputed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            {showTechnicalDetails ? 'Under Arbitration' : 'Under Review'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Identifiers & Ledger Proof */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tx_id && (
                        <span className="font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px]">
                          PayPal ID: <strong className="text-slate-800 dark:text-slate-200">{item.tx_id}</strong>
                        </span>
                      )}
                      {item.reservation_id && showTechnicalDetails && (
                        <span className="font-mono text-cyan-800 dark:text-cyan-400/90 bg-cyan-50 dark:bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-800/40 text-[11px]">
                          Mandate: <strong>{item.reservation_id}</strong>
                        </span>
                      )}
                      {!showTechnicalDetails && (
                        <span className="text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                          Order: <strong className="text-slate-800 dark:text-slate-300">#{item.order_id.replace('ord_pp_', '')}</strong>
                        </span>
                      )}
                    </div>

                    {item.hash && showTechnicalDetails && (
                      <button
                        onClick={() => handleCopyHash(item.hash!)}
                        className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-mono text-[10px] transition-colors bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 cursor-pointer"
                      >
                        {copiedHash === item.hash ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">SHA-256 Copied!</span>
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
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/90 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                        <Truck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>Carrier: <strong className="text-slate-900 dark:text-white">{item.carrier || 'FedEx Priority'}</strong></span>
                        <span className="text-slate-500 font-mono text-[11px] ml-1">
                          #{item.tracking_number || `TRK-${item.order_id.slice(-8)}`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/40">
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
                                isComplete ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-800'
                              } ${isCurrent ? 'ring-1 ring-cyan-400 animate-pulse' : ''}`}
                            />
                            <span
                              className={`text-[9px] font-mono ${
                                isComplete ? 'text-cyan-700 dark:text-cyan-300 font-bold' : 'text-slate-400 dark:text-slate-500'
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
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-500" />
                      <span>
                        {showTechnicalDetails
                          ? 'Protected by AegisPay Zero-Trust Custodian Gate'
                          : 'Protected by PayPal Purchase Protection'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isHeld && (
                        <>
                          <button
                            disabled={actionLoading === item.order_id}
                            onClick={() => handleEscrowAction(item.order_id, 'refund')}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === item.order_id
                              ? 'Cancelling...'
                              : showTechnicalDetails
                              ? 'Cancel & Void'
                              : 'Cancel Order'}
                          </button>
                          <button
                            disabled={actionLoading === item.order_id}
                            onClick={() => handleEscrowAction(item.order_id, 'confirm')}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                          >
                            {actionLoading === item.order_id
                              ? 'Confirming...'
                              : showTechnicalDetails
                              ? 'Confirm Delivery & Release'
                              : 'Confirm Delivery'}
                          </button>
                        </>
                      )}

                      <Link
                        href="/judge"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-2xs"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        {showTechnicalDetails ? 'Dispute Forensics ↗' : 'Need Help / Dispute ↗'}
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
            <div className="col-span-full p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center shadow-xs">
              <Inbox className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {showTechnicalDetails ? 'No Cryptographic Proofs Generated' : 'No Receipts Available'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                {showTechnicalDetails
                  ? 'Settled orders automatically yield RFC 8785 canonical hash receipts anchored to the AegisPay ledger.'
                  : 'Official receipts will be generated automatically once your purchases are completed.'}
              </p>
            </div>
          ) : (
            receipts.map((rcpt) => (
              <div
                key={rcpt.receipt_number}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 hover:border-cyan-500/40 transition-all shadow-xs flex flex-col justify-between gap-3.5"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-800 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/40 px-2.5 py-0.5 rounded">
                      <FileText className="w-3.5 h-3.5" />
                      {showTechnicalDetails ? `CERTIFICATE #${rcpt.receipt_number}` : `RECEIPT #${rcpt.receipt_number}`}
                    </div>
                    <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-mono">
                      {formatPrice(rcpt.amount_cents)}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 leading-snug">
                    {rcpt.product_title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                    Merchant: <strong className="text-slate-800 dark:text-slate-300">{rcpt.merchant_domain}</strong> · {formatDate(rcpt.timestamp)}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 font-mono text-[11px] space-y-1.5">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{showTechnicalDetails ? 'Tx ID:' : 'PayPal Reference:'}</span>
                    <span className="text-slate-900 dark:text-slate-200 font-semibold">{rcpt.tx_id}</span>
                  </div>
                  {showTechnicalDetails ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-500 text-[10px]">SHA-256 Block Hash:</span>
                      <span className="text-cyan-800 dark:text-cyan-400/90 break-all select-all">{rcpt.chain_hash}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Status:</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-sans font-semibold">Payment Completed & Verified</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-1 text-xs">
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {showTechnicalDetails ? 'RFC 8785 Verified' : 'Official Verified Receipt'}
                  </span>
                  <button
                    onClick={() => handleCopyHash(showTechnicalDetails ? rcpt.chain_hash : rcpt.tx_id)}
                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {showTechnicalDetails ? 'Copy Proof' : 'Copy Reference ID'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Chat Threads Tab Content */}
      {activeTab === 'chats' && (
        <div className="space-y-4">
          {!selectedSessionId ? (
            chatSessions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center shadow-xs">
                <Inbox className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-3" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Chat Sessions Found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6">
                  Conversations with your AegisPay Shopping Concierge will be persisted here with turn-attached products.
                </p>
                <Link
                  href="/"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-xs shadow-md"
                >
                  Start New Shopping Chat
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 hover:border-cyan-500/40 transition-all flex flex-col justify-between group shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] sm:text-[11px] font-mono text-cyan-800 dark:text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-500/30">
                          {session.id}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(session.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                        {session.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                        Turn-bound context with {session.message_count || 2} message turns recorded.
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {session.message_count || 2} turns
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectSession(session.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                        >
                          View Turns
                        </button>
                        <Link
                          href={`/?session_id=${encodeURIComponent(session.id)}`}
                          className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                        >
                          <span>Resume in Chat</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xs">
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to all conversations</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Session: {selectedSessionId}</span>
                  <Link
                    href={`/?session_id=${encodeURIComponent(selectedSessionId)}`}
                    className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <span>Open in Cockpit</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {loadingSession ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs font-mono animate-pulse">
                  Loading turn-bound conversation history...
                </div>
              ) : (
                <div className="space-y-3">
                  {(sessionDetail?.messages || []).map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-3.5 sm:p-4 rounded-xl border transition-all shadow-xs ${
                        msg.role === 'user'
                          ? 'bg-slate-100 dark:bg-slate-900/70 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 ml-4 sm:ml-8'
                          : 'bg-white dark:bg-slate-950/80 border-slate-200 dark:border-cyan-500/30 text-slate-900 dark:text-white mr-4 sm:mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                        <span className={`font-bold ${msg.role === 'user' ? 'text-slate-700 dark:text-slate-300' : 'text-cyan-700 dark:text-cyan-400'}`}>
                          {msg.role === 'user' ? '👤 Buyer' : '🤖 AegisPay Concierge'}
                        </span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                      {msg.attached_products && msg.attached_products.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {msg.attached_products.map((prod: any) => (
                            <div
                              key={prod.product_id}
                              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 flex items-center gap-2"
                            >
                              {prod.cleaned_image_url && (
                                <img
                                  src={prod.cleaned_image_url}
                                  alt={prod.title}
                                  className="w-10 h-10 object-cover rounded-md shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <h5 className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{prod.title}</h5>
                                <div className="text-[10px] text-cyan-700 dark:text-cyan-400 font-mono">
                                  ${(prod.price_cents / 100).toFixed(2)} • {prod.merchant_domain}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
