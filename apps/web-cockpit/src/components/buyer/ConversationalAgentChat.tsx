'use client';

import React, { useState, useRef, useEffect } from 'react';
import type {
  ProductCardData,
  ComparisonMatrix,
  ChatResponsePayload,
  ShoppingActionType,
} from '@aegispay/shared-types';
import {
  Send,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Tag,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  Scale,
  ShoppingBag,
  ExternalLink,
  Layers,
  Info,
  Zap,
  Code,
  Key,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: ShoppingActionType;
  products?: ProductCardData[];
  comparison?: ComparisonMatrix;
  product_detail?: ProductCardData;
  cart?: any;
  stock_reservation?: any;
  thought_trace?: string[];
  follow_up_suggestions?: string[];
}

import { PurchaseConfirmationCard } from './PurchaseConfirmationCard';

interface ConversationalAgentChatProps {
  onSelectProductForDetails?: (product: ProductCardData) => void;
  onSelectProductForCompare?: (product: ProductCardData) => void;
  onSelectProductForBuy?: (product: ProductCardData) => void;
  onOpenCart?: () => void;
  onPurchaseConfirmed?: (result: { orderId: string; authorizedCents: number }) => void;
  budgetCapCents?: number;
  zipCode?: string;
  developerModeEnabled?: boolean;
  selectedModel?: string;
  userApiKey?: string;
}

export function ConversationalAgentChat({
  onSelectProductForDetails,
  onSelectProductForCompare,
  onSelectProductForBuy,
  onOpenCart,
  onPurchaseConfirmed,
  budgetCapCents = 50000,
  zipCode = '94016',
  developerModeEnabled = false,
  selectedModel,
  userApiKey,
}: ConversationalAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'Hello! I am your AegisPay Shopping Concierge. I can discover products across Channel3 merchants, compare specs side-by-side, calculate instant commission rebates, and verify stock with 2PC inventory holds before you purchase.',
      timestamp: new Date(),
      follow_up_suggestions: [
        'Find me wireless noise-cancelling headphones under $350',
        'Compare audiophile setups',
        'Minimalist walnut desk workspace under $400',
      ],
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string, actionOverride?: ShoppingActionType, productIds?: string[]) => {
    const text = (textToSend || inputMessage).trim();
    if (!text && !actionOverride) return;

    const userMsgId = `msg-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (developerModeEnabled && userApiKey && userApiKey.trim().length > 0) {
        headers['x-user-llm-api-key'] = userApiKey.trim();
      }

      const payload: Record<string, any> = {
        message: text,
        action: actionOverride,
        product_ids: productIds,
        budget_cap_cents: budgetCapCents,
        zip_code: zipCode,
      };

      if (developerModeEnabled && selectedModel && selectedModel.trim().length > 0) {
        payload.model = selectedModel.trim();
        if (userApiKey && userApiKey.trim().length > 0) {
          payload.user_api_key = userApiKey.trim();
        }
      }

      const res = await fetch('/api/buyer/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data: ChatResponsePayload = await res.json();

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.markdown || 'Here is what I found for you.',
        timestamp: new Date(),
        action: data.action,
        products: data.products,
        comparison: data.comparison,
        product_detail: data.product_detail,
        cart: data.cart,
        stock_reservation: data.stock_reservation,
        thought_trace: data.thought_trace,
        follow_up_suggestions: data.follow_up_suggestions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: '⚠️ I encountered an error connecting to the shopping agent. Please try again or rephrase your request.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = (action: ShoppingActionType, product: ProductCardData) => {
    if (action === 'DETAILS') {
      if (onSelectProductForDetails) {
        onSelectProductForDetails(product);
      }
      handleSendMessage(`Show details and specs for ${product.title}`, 'DETAILS', [product.product_id]);
    } else if (action === 'COMPARE') {
      if (onSelectProductForCompare) {
        onSelectProductForCompare(product);
      }
      handleSendMessage(`Compare ${product.title} with alternative products`, 'COMPARE', [product.product_id]);
    } else if (action === 'BUY') {
      if (onSelectProductForBuy) {
        onSelectProductForBuy(product);
      }
      handleSendMessage(`Proceed to buy ${product.title}`, 'BUY', [product.product_id]);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-cyan-200/80 dark:border-cyan-500/30 rounded-2xl shadow-sm dark:shadow-2xl overflow-hidden flex flex-col h-[700px] transition-colors">
      {/* Chat Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50/70 dark:bg-[#070d18]/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b1324]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                AegisPay Shopping Concierge
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                Channel3 Vector Grounded
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Promo code: <code className="text-cyan-600 dark:text-cyan-400 font-bold">PAYPAL-HACKATHON-2026</code> • 2PC Stock Verified
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400">
          {developerModeEnabled ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-sans text-[11px] font-semibold"
              title={userApiKey ? 'User-Scoped BYOK Key Active' : 'Developer Model Override Active'}
            >
              <Code className="w-3.5 h-3.5 text-amber-500" />
              <span>Dev: {selectedModel ? selectedModel.split('/')[1] || selectedModel : 'Default Deployment'}</span>
              {userApiKey && <Key className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-sans text-[11px] font-medium">
              <Sparkles className="w-3 h-3 text-cyan-500" />
              <span>Autonomous Assistant</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Escrow Protected</span>
          </div>
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-4xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
              }`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>

            {/* Bubble Content */}
            <div className={`space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[88%]`}>
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-xs shadow-md shadow-blue-500/10'
                    : 'bg-slate-100 dark:bg-[#070e1c] border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-slate-200 rounded-tl-xs shadow-xs'
                }`}
              >
                {/* Markdown text rendered cleanly */}
                <div className="whitespace-pre-line text-[13.5px] leading-relaxed">
                  {msg.content}
                </div>

                {/* Thought Trace Accordion */}
                {msg.thought_trace && msg.thought_trace.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTraceId(expandedTraceId === msg.id ? null : msg.id)
                      }
                      className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{expandedTraceId === msg.id ? 'Hide Agent Thought Trace' : 'View Agent Thought Trace'}</span>
                      {expandedTraceId === msg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {expandedTraceId === msg.id && (
                      <div className="mt-2 p-2.5 rounded-lg bg-black/5 dark:bg-black/30 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                        {msg.thought_trace.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            <span className="text-cyan-500 shrink-0">›</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Generative Product Cards Grid */}
              {msg.products && msg.products.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 w-full">
                  {msg.products.map((product) => (
                    <ProductCard
                      key={product.product_id}
                      product={product}
                      onAction={(act) => handleActionClick(act, product)}
                    />
                  ))}
                </div>
              )}

              {/* Side-by-side Comparison Matrix Card */}
              {msg.comparison && (
                <div className="w-full pt-1">
                  <ComparisonMatrixCard
                    matrix={msg.comparison}
                    onAction={(act, prod) => handleActionClick(act, prod)}
                  />
                </div>
              )}

              {/* Pre-Purchase Confirmation Card for BUY actions */}
              {msg.cart && (
                <div className="w-full pt-2">
                  <PurchaseConfirmationCard
                    cart={msg.cart}
                    zipCode={zipCode}
                    onViewFullCart={onOpenCart}
                    onConfirmPurchase={(result) => {
                      if (onPurchaseConfirmed) {
                        onPurchaseConfirmed({
                          orderId: result.orderId,
                          authorizedCents: result.authorizedCents,
                        });
                      }
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `conf-${Date.now()}`,
                          role: 'assistant',
                          content: `🎉 **Purchase Successfully Confirmed!**\n\nYour order \`${result.orderId}\` has been authorized via your vaulted PayPal payment token. AegisPay is actively monitoring prices for the next 72 hours under automated escrow protection.`,
                          timestamp: new Date(),
                        },
                      ]);
                    }}
                  />
                </div>
              )}

              {/* Follow-up Suggestion Chips */}
              {msg.follow_up_suggestions && msg.follow_up_suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.follow_up_suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(suggestion)}
                      className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25 transition-all text-left flex items-center gap-1 hover:scale-102"
                    >
                      <Tag className="w-2.5 h-2.5 text-cyan-500" />
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 max-w-xl mr-auto items-center text-xs text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 flex items-center justify-center animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#070e1c] border border-slate-200 dark:border-slate-800 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" />
              <span className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300 ml-1">
                Querying Channel3 & verifying stock...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50/70 dark:bg-[#070d18]/70"
      >
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask about products, compare specs, or say 'Buy for me'..."
            disabled={isLoading}
            className="w-full pl-4 pr-24 py-3 bg-white dark:bg-[#050912] border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all font-sans"
          />
          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="absolute right-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Product Card Subcomponent ---

interface ProductCardProps {
  product: ProductCardData;
  onAction: (action: ShoppingActionType) => void;
}

export function ProductCard({ product, onAction }: ProductCardProps) {
  const netCents = product.price_cents - (product.commission_rebate_cents || 0);

  return (
    <div className="bg-white dark:bg-[#080f20] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-cyan-500/40 transition-all flex flex-col group">
      {/* Product Image & Badges */}
      <div className="relative aspect-4/3 w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.cleaned_image_url || product.image_url}
          alt={product.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
        />

        {/* Badges Overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.free_shipping && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold shadow-xs flex items-center gap-1 backdrop-blur-xs">
              <Truck className="w-2.5 h-2.5" /> Free Shipping
            </span>
          )}
          {product.commission_rebate_cents > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-cyan-600/90 text-white text-[10px] font-bold shadow-xs backdrop-blur-xs">
              Rebate: -{formatCents(product.commission_rebate_cents)}
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-mono backdrop-blur-xs flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
            {product.merchant_credibility_score}%
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
            {product.merchant_domain}
          </div>
          <h4 className="font-bold text-slate-900 dark:text-white text-xs line-clamp-2 leading-snug">
            {product.title}
          </h4>
        </div>

        {/* Pricing */}
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-baseline justify-between">
          <div>
            <div className="text-sm font-black text-slate-900 dark:text-white">
              {formatCents(netCents)}
            </div>
            {product.commission_rebate_cents > 0 && (
              <div className="text-[10px] text-slate-500 line-through">
                {formatCents(product.price_cents)}
              </div>
            )}
          </div>

          <div className="text-right text-[10px] text-slate-500 dark:text-slate-400">
            <span>★ {product.rating}</span>
            <span className="text-slate-400 ml-1">({product.review_count})</span>
          </div>
        </div>

        {/* Action Buttons: [Details], [Compare], [Buy for Me] */}
        <div className="grid grid-cols-3 gap-1 pt-1">
          <button
            type="button"
            onClick={() => onAction('DETAILS')}
            className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 text-[11px] font-semibold transition-all border border-slate-200 dark:border-slate-700 text-center"
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => onAction('COMPARE')}
            className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 text-[11px] font-semibold transition-all border border-slate-200 dark:border-slate-700 text-center"
          >
            Compare
          </button>
          <button
            type="button"
            onClick={() => onAction('BUY')}
            className="px-2 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[11px] font-bold transition-all shadow-xs text-center flex items-center justify-center gap-0.5"
          >
            <span>Buy</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Side-by-side Comparison Matrix Subcomponent ---

interface ComparisonMatrixCardProps {
  matrix: ComparisonMatrix;
  onAction: (action: ShoppingActionType, product: ProductCardData) => void;
}

export function ComparisonMatrixCard({ matrix, onAction }: ComparisonMatrixCardProps) {
  const products = matrix.products || [];

  return (
    <div className="bg-white dark:bg-[#070e1c] border border-cyan-500/30 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            Side-by-Side Comparison Matrix
          </h4>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
          {products.length} Products Evaluated
        </span>
      </div>

      {matrix.rationale && (
        <div className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 border-b border-cyan-200/50 dark:border-cyan-500/20 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-700 dark:text-cyan-300">Winning Rationale: </strong>
            <span>{matrix.rationale}</span>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1222]">
              <th className="py-2.5 px-3 font-semibold text-slate-500 dark:text-slate-400 w-36">
                Feature / Spec
              </th>
              {products.map((p) => {
                const isWinner = p.product_id === matrix.winner_product_id;
                return (
                  <th
                    key={p.product_id}
                    className={`py-2.5 px-3 font-bold text-slate-900 dark:text-white min-w-[180px] ${
                      isWinner ? 'bg-cyan-500/10 border-l border-r border-cyan-500/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-1">{p.title}</span>
                      {isWinner && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-500/40 shrink-0">
                          Top Pick
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
            {matrix.rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-[11px]">
                  {row.attribute}
                </td>
                {products.map((p) => {
                  const val = row.values[p.product_id] || '-';
                  const isHighlighted = row.highlighted_product_id === p.product_id;
                  const isWinner = p.product_id === matrix.winner_product_id;
                  return (
                    <td
                      key={p.product_id}
                      className={`py-2 px-3 text-[11.5px] ${
                        isHighlighted
                          ? 'font-bold text-cyan-600 dark:text-cyan-400'
                          : 'text-slate-700 dark:text-slate-300'
                      } ${isWinner ? 'bg-cyan-500/5 border-l border-r border-cyan-500/20' : ''}`}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0a1222]">
              <td className="py-2.5 px-3 font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                Instant Action
              </td>
              {products.map((p) => {
                const isWinner = p.product_id === matrix.winner_product_id;
                return (
                  <td
                    key={p.product_id}
                    className={`py-2.5 px-3 ${
                      isWinner ? 'bg-cyan-500/10 border-l border-r border-cyan-500/30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onAction('BUY', p)}
                      className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 ${
                        isWinner
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span>Buy for Me</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
