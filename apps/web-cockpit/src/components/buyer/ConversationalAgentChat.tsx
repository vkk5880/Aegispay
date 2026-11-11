'use client';

import React, { useState, useRef, useEffect } from 'react';
import { webLogger as logger } from '@/lib/logger';
import type {
  ProductCardData,
  ComparisonMatrix,
  ShoppingActionType,
  ActiveTurnProduct,
} from '@aegispay/shared-types';
import {
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
  Columns,
  X,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { ChatInputBar } from './ChatInputBar';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import {
  useShoppingAssistantRuntime,
} from '@/lib/assistantUiRuntime';
import {
  SearchCatalogToolUI,
  DiscoverProductsToolUI,
  FilterTurnProductsToolUI,
  CompareProductsToolUI,
  PrepareCheckoutToolUI,
  BuyerToolCallbacksProvider,
  GenerativeProductCard,
  ComparisonMatrixCard,
} from './BuyerGenerativeTools';
import { BattleArena } from './BattleArena';
import { PurchaseConfirmationCard } from './PurchaseConfirmationCard';

// Re-export for 100% backward compatibility
export { GenerativeProductCard as ProductCard, ComparisonMatrixCard };
export type { GenerativeProductCardProps as ProductCardProps, ComparisonMatrixCardProps } from './BuyerGenerativeTools';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | string;
  attached_products?: ProductCardData[];
  focused_product_id?: string;
  selected_product_ids?: string[];
  action?: ShoppingActionType;
  products?: ProductCardData[];
  comparison?: ComparisonMatrix;
  product_detail?: ProductCardData;
  cart?: any;
  stock_reservation?: any;
  thought_trace?: string[];
  follow_up_suggestions?: string[];
}

export interface ConversationalAgentChatProps {
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
  cartItemCount?: number;
  cartSubtotalCents?: number;
}

export function ConversationalAgentChat({
  onSelectProductForDetails,
  onSelectProductForCompare,
  onSelectProductForBuy,
  onOpenCart,
  onPurchaseConfirmed,
  budgetCapCents = 50000,
  zipCode = '94016',
  developerModeEnabled: devProp = false,
  selectedModel = 'google/gemini-3.5-flash-lite',
  userApiKey,
  cartItemCount = 0,
  cartSubtotalCents = 0,
}: ConversationalAgentChatProps) {
  const { showTechnicalDetails } = useUiMode();
  const developerModeEnabled = devProp || showTechnicalDetails;

  const [inputMessage, setInputMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductCardData[]>([]);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);

  // Active comparison & cart state for the Cockpit Drawer
  const [activeComparison, setActiveComparison] = useState<ComparisonMatrix | null>(null);
  const [activeCart, setActiveCart] = useState<any | null>(null);

  // Split-screen Cockpit state
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  // Load saved message history from localStorage if available
  const [savedMessages] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aegispay_saved_chat_messages');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            logger.info('[BuyerChat:Storage] Restored saved chat history from localStorage', {
              messageCount: parsed.length,
            });
            return parsed;
          }
        }
      } catch (err: any) {
        logger.warn('[BuyerChat:Storage] Failed to read saved chat messages', { error: err?.message });
      }
    }
    return [];
  });

  const sessionIdRef = useRef<string>(
    typeof window !== 'undefined' && localStorage.getItem('aegispay_current_chat_session_id')
      ? (localStorage.getItem('aegispay_current_chat_session_id') as string)
      : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  const activeTurnProductsRef = useRef<ActiveTurnProduct[]>([]);
  const viewportEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aegispay_current_chat_session_id', sessionIdRef.current);
      } catch {}
    }
  }, []);

  // Auto-open side panel when 2 or more products are selected for comparison
  useEffect(() => {
    if (selectedProducts.length >= 2 && !isSidePanelOpen) {
      logger.info('[BuyerChat:Layout] Multi-product selection detected; opening cockpit side panel', {
        selectedCount: selectedProducts.length,
      });
      setIsSidePanelOpen(true);
    }
  }, [selectedProducts.length, isSidePanelOpen]);

  // Handle Multi-Select Product Toggle
  const handleToggleSelectProduct = (product: ProductCardData) => {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.product_id === product.product_id);
      if (exists) {
        logger.info('[BuyerChat:MultiSelect] Deselecting product', { productId: product.product_id });
        if (focusedProductId === product.product_id) {
          setFocusedProductId(null);
        }
        return prev.filter((p) => p.product_id !== product.product_id);
      } else {
        logger.info('[BuyerChat:MultiSelect] Selecting product for multi-item action', {
          productId: product.product_id,
          title: product.title,
          newCount: prev.length + 1,
        });
        return [...prev, product];
      }
    });
  };

  // Handle Single Item Focus
  const handleAskAboutSingle = (product: ProductCardData) => {
    logger.info('[BuyerChat:SingleItemDeepDive] Focusing product for AI deep-dive', {
      productId: product.product_id,
      title: product.title,
    });
    setFocusedProductId(product.product_id);
    setSelectedProducts([product]);
    setInputMessage(`What are the key specs, warranty, and seller credibility for ${product.title}?`);
    if (onSelectProductForDetails) {
      onSelectProductForDetails(product);
    }
  };

  // Initialize the assistant-ui local streaming runtime
  const runtime = useShoppingAssistantRuntime({
    sessionId: sessionIdRef.current,
    getActiveTurnProducts: () => activeTurnProductsRef.current,
    getSelectedProductIds: () => selectedProducts.map((p) => p.product_id),
    budgetCapCents,
    zipCode,
    developerModeEnabled,
    selectedModel,
    userApiKey,
    initialMessages: savedMessages,
    onTurnProductsReceived: (products) => {
      logger.info('[BuyerChat:TurnProducts] Grounded turn products bound to context', { count: products.length });
      activeTurnProductsRef.current = products.map((p, idx) => ({
        index: idx + 1,
        product_id: p.product_id,
        title: p.title,
        price_cents: p.price_cents,
        merchant_domain: p.merchant_domain,
        rating: p.rating,
        free_shipping: Boolean(p.free_shipping),
        specs: p.specs,
      }));
    },
    onComparisonReceived: (comp) => {
      logger.info('[BuyerChat:Comparison] Comparison matrix received; updating arena drawer');
      setActiveComparison(comp);
      setIsSidePanelOpen(true);
    },
    onCartReceived: (cartData) => {
      logger.info('[BuyerChat:Cart] Cart settlement payload received');
      setActiveCart(cartData);
    },
    onError: (err) => {
      logger.error('[BuyerChat:Runtime] Chat stream encountered error', { error: err.message });
      setIsSubmitting(false);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text && selectedProducts.length === 0) return;

    const messageText =
      text ||
      (selectedProducts.length >= 2
        ? `Compare these ${selectedProducts.length} selected products side-by-side`
        : `Inspect selected item ${selectedProducts[0]?.title || ''}`);

    logger.info('[BuyerChat:Send] Submitting user message to assistant-ui thread', {
      textLength: messageText.length,
      selectedCount: selectedProducts.length,
      activeTurnCount: activeTurnProductsRef.current.length,
    });

    setIsSubmitting(true);
    try {
      runtime.thread.append(messageText);

      // Persist user turn to localStorage
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('aegispay_saved_chat_messages');
          const currentList: any[] = raw ? JSON.parse(raw) : [];
          currentList.push({
            role: 'user',
            content: [{ type: 'text', text: messageText }],
          });
          localStorage.setItem('aegispay_saved_chat_messages', JSON.stringify(currentList));
        } catch {}
      }
    } catch (err: any) {
      logger.warn('[BuyerChat:Send] Failed to append message directly to thread', { error: err?.message });
    } finally {
      setIsSubmitting(false);
      if (!textToSend) setInputMessage('');
    }
  };

  const handleNewChat = () => {
    logger.info('[BuyerChat:NewChat] Resetting chat session and starting new conversation');
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('aegispay_saved_chat_messages');
        const newSession = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('aegispay_current_chat_session_id', newSession);
        sessionIdRef.current = newSession;
      } catch {}
      window.location.reload();
    }
  };

  const handleCompareSelected = () => {
    if (selectedProducts.length < 2) return;
    const titles = selectedProducts.map((p) => p.title).join(' vs ');
    logger.info('[BuyerChat:CompareSelected] Triggering multi-product comparison', {
      selectedCount: selectedProducts.length,
    });
    handleSendMessage(`Compare these ${selectedProducts.length} products side-by-side: ${titles}`);
  };

  const handleBundleSelected = () => {
    if (selectedProducts.length < 1) return;
    logger.info('[BuyerChat:BundleSelected] Triggering multi-item bundling feasibility');
    handleSendMessage(
      `Can I buy all ${selectedProducts.length} of these items within my $${(budgetCapCents / 100).toFixed(0)} budget cap?`
    );
  };

  const handleActionClick = (action: ShoppingActionType, product: ProductCardData) => {
    logger.info('[BuyerChat:ActionClick] Triggering quick product action', {
      action,
      productId: product.product_id,
      title: product.title,
    });

    if (action === 'COMPARE') {
      handleToggleSelectProduct(product);
      if (onSelectProductForCompare) onSelectProductForCompare(product);
    } else if (action === 'DETAILS') {
      handleAskAboutSingle(product);
    } else if (action === 'BUY') {
      if (onSelectProductForBuy) onSelectProductForBuy(product);
      handleSendMessage(`Buy ${product.title} for me with 2PC stock verification`);
    }
  };

  const handlePurchaseConfirmedInternal = (result: { orderId: string; authorizedCents: number }) => {
    logger.info('[BuyerChat:PurchaseConfirmed] Purchase confirmed in thread', result);
    if (onPurchaseConfirmed) {
      onPurchaseConfirmed(result);
    }
    try {
      runtime.thread.append(
        `🎉 **Purchase Confirmed!**\n\nOrder \`${result.orderId}\` authorized for ${formatCents(result.authorizedCents)} via vaulted PayPal token. Real-time 72-hour price drop escrow active.`
      );
    } catch (e) {
      // ignore append error if already resolved
    }
  };

  const promptSuggestions = [
    'Find me wireless noise-cancelling headphones under $350',
    'Compare audiophile setups side-by-side',
    'Minimalist walnut desk workspace under $400',
    'Can I buy these within budget with 2PC hold?',
  ];

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <BuyerToolCallbacksProvider
        value={{
          selectedProducts,
          onToggleSelectProduct: handleToggleSelectProduct,
          onAskAi: handleAskAboutSingle,
          onAction: handleActionClick,
          zipCode,
          onViewFullCart: onOpenCart,
          onPurchaseConfirmed: handlePurchaseConfirmedInternal,
        }}
      >
        {/* Generative Tool UI Mounts */}
        <SearchCatalogToolUI />
        <DiscoverProductsToolUI />
        <FilterTurnProductsToolUI />
        <CompareProductsToolUI />
        <PrepareCheckoutToolUI />

        {/* Responsive Cockpit Container: Split-Screen Desktop & Mobile Drawer */}
        <div className="flex flex-col lg:flex-row gap-4 h-[760px] bg-white/80 dark:bg-[#070d1a]/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl transition-all">
          {/* Main Left Panel: Conversation Thread & Input Bar */}
          <div
            className={`flex flex-col h-full transition-all duration-300 ${
              isSidePanelOpen ? 'lg:w-3/5 w-full' : 'w-full'
            }`}
          >
            {/* Thread Header Toolbar */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#081124] dark:to-[#0a152e] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {showTechnicalDetails ? 'AegisPay Autonomous Concierge' : 'AegisPay Shopping Assistant'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                      Mastra SSE
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
                    <span>Model: {selectedModel.split('/').pop()}</span>
                    <span>•</span>
                    <span>Cap: {formatCents(budgetCapCents)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: New Chat, Toggle Arena, Consolidated Multi-Vendor Cart */}
              <div className="flex items-center gap-2">
                {/* New Chat Reset Button */}
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Start a new chat session (clears chat history)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Chat</span>
                </button>

                {/* Side-by-Side Arena Toggle */}
                <button
                  type="button"
                  onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer ${
                    isSidePanelOpen
                      ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 border-cyan-500'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-500/40'
                  }`}
                  title={isSidePanelOpen ? 'Collapse side cockpit panel' : 'Expand side comparison arena'}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {isSidePanelOpen ? 'Hide Arena' : 'Side-by-Side Arena'}
                  </span>
                  {selectedProducts.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-cyan-600 text-white text-[10px] flex items-center justify-center font-bold">
                      {selectedProducts.length}
                    </span>
                  )}
                </button>

                {/* Consolidated Cart Button */}
                {onOpenCart && (
                  <button
                    type="button"
                    onClick={onOpenCart}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs text-xs font-semibold"
                    title="Open Unified Multi-Store Cart"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Cart</span>
                    {cartItemCount > 0 ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-mono font-bold flex items-center gap-1">
                        <span>{cartItemCount}</span>
                        {cartSubtotalCents > 0 && (
                          <span className="hidden md:inline font-normal opacity-90">
                            • {formatCents(cartSubtotalCents)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal font-mono">(0)</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* assistant-ui Thread Messages Viewport */}
            <ThreadPrimitive.Root className="flex flex-col flex-1 overflow-hidden">
              <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth">
                <ThreadPrimitive.Messages
                  components={{
                    Message: () => (
                      <MessagePrimitive.Root className="flex flex-col gap-2">
                        {/* User Message Rendering */}
                        <MessagePrimitive.If user>
                          <div className="flex items-start justify-end gap-2.5 max-w-2xl ml-auto">
                            <div className="flex flex-col items-end gap-1">
                              <div className="px-4 py-2.5 rounded-2xl rounded-tr-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs leading-relaxed shadow-xs">
                                <MessagePrimitive.Parts
                                  components={{
                                    Text: () => (
                                      <MarkdownTextPrimitive
                                        className="max-w-none text-xs text-white"
                                        components={{
                                          p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed text-white">{children}</p>,
                                        }}
                                      />
                                    ),
                                  }}
                                />
                              </div>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                              <User className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
                            </div>
                          </div>
                        </MessagePrimitive.If>

                        {/* Assistant Message Rendering */}
                        <MessagePrimitive.If assistant>
                          <div className="flex items-start gap-2.5 max-w-full">
                            <div className="w-7 h-7 rounded-full bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
                              <Bot className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                            </div>
                            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                              <div className="px-4 py-3 rounded-2xl rounded-tl-xs bg-white dark:bg-[#070f20] border border-slate-200/90 dark:border-slate-800/80 text-xs text-slate-800 dark:text-slate-200 leading-relaxed shadow-2xs">
                                <MessagePrimitive.Parts
                                  components={{
                                    Text: () => (
                                      <div className="max-w-none text-xs text-slate-800 dark:text-slate-200 leading-relaxed space-y-1.5">
                                        <MarkdownTextPrimitive
                                          components={{
                                            h1: ({ children }) => <h1 className="text-sm font-bold text-slate-900 dark:text-white mt-2 mb-1">{children}</h1>,
                                            h2: ({ children }) => <h2 className="text-xs font-bold text-slate-900 dark:text-white mt-1.5 mb-1">{children}</h2>,
                                            h3: ({ children }) => <h3 className="text-xs font-semibold text-slate-900 dark:text-white mt-1 mb-0.5">{children}</h3>,
                                            p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-200">{children}</p>,
                                            ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 mb-2 text-slate-700 dark:text-slate-300">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 mb-2 text-slate-700 dark:text-slate-300">{children}</ol>,
                                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                            code: ({ children }) => (
                                              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-cyan-800 dark:text-cyan-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
                                                {children}
                                              </code>
                                            ),
                                            pre: ({ children }) => (
                                              <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto text-[11px] font-mono border border-slate-800 my-2">
                                                {children}
                                              </pre>
                                            ),
                                            blockquote: ({ children }) => (
                                              <blockquote className="border-l-2 border-cyan-500 pl-2.5 py-0.5 italic text-slate-600 dark:text-slate-400 my-1">
                                                {children}
                                              </blockquote>
                                            ),
                                            table: ({ children }) => (
                                              <div className="overflow-x-auto my-2 rounded-lg border border-slate-200 dark:border-slate-800">
                                                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-[11px]">{children}</table>
                                              </div>
                                            ),
                                            thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-700 dark:text-slate-300">{children}</thead>,
                                            tbody: ({ children }) => <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 bg-white dark:bg-transparent">{children}</tbody>,
                                            th: ({ children }) => <th className="px-2.5 py-1.5 text-left font-bold">{children}</th>,
                                            td: ({ children }) => <td className="px-2.5 py-1.5 text-slate-800 dark:text-slate-200">{children}</td>,
                                            a: ({ href, children }) => (
                                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 underline underline-offset-2 hover:text-cyan-500">
                                                {children}
                                              </a>
                                            ),
                                          }}
                                        />
                                      </div>
                                    ),
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </MessagePrimitive.If>
                      </MessagePrimitive.Root>
                    ),
                  }}
                />
                <div ref={viewportEndRef} />
              </ThreadPrimitive.Viewport>

              {/* Follow-up Quick Suggestion Chips */}
              <div className="px-5 py-2 bg-slate-50/50 dark:bg-[#080f20]/50 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap gap-1.5 shrink-0">
                {promptSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(suggestion)}
                    className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 hover:bg-cyan-500/10 text-slate-600 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 text-[11px] font-medium transition-all border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer active:scale-95 flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-cyan-500" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>

              {/* Phase 3 Interactive Multi-Chip ChatInputBar */}
              <div className="p-3 bg-white dark:bg-[#081124] border-t border-slate-200 dark:border-slate-800 shrink-0">
                <ChatInputBar
                  inputMessage={inputMessage}
                  onInputChange={setInputMessage}
                  onSubmit={() => handleSendMessage()}
                  isLoading={isSubmitting}
                  selectedProducts={selectedProducts}
                  onRemoveSelectedProduct={(productId) => {
                    logger.info('[BuyerChat:RemoveChip] Removing selected product chip', {
                      productId,
                    });
                    setSelectedProducts((prev) => prev.filter((p) => p.product_id !== productId));
                    if (focusedProductId === productId) {
                      setFocusedProductId(null);
                    }
                  }}
                  onClearAllSelected={() => {
                    logger.info('[BuyerChat:ClearAll] Cleared all selected product chips');
                    setSelectedProducts([]);
                    setFocusedProductId(null);
                  }}
                  onCompareSelected={handleCompareSelected}
                  onBundleSelected={handleBundleSelected}
                  onAskAboutSingle={handleAskAboutSingle}
                  budgetCapCents={budgetCapCents}
                />
              </div>
            </ThreadPrimitive.Root>
          </div>

          {/* Right Panel: Split-Screen Cockpit Arena / Comparison / Cart Drawer on Desktop */}
          {isSidePanelOpen && (
            <div className="hidden lg:flex lg:w-2/5 flex-col h-full border-l border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#070e1c]/80 p-4 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                  <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>Cockpit Decision Arena</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSidePanelOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Close side panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Active Multi-Product Arena or Selected Contenders */}
              {selectedProducts.length >= 2 ? (
                <div className="space-y-4">
                  <BattleArena
                    contenders={selectedProducts}
                    winner={selectedProducts[0]}
                    battleReport="Active contender comparison from your multi-chip selection. Real-time referee score and head-to-head metrics displayed."
                    onSelectWinner={(winProd) => handleActionClick('BUY', winProd)}
                  />
                  <button
                    type="button"
                    onClick={handleCompareSelected}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Run AI Spec Comparison in Stream</span>
                  </button>
                </div>
              ) : activeComparison ? (
                <div className="space-y-4">
                  <BattleArena
                    contenders={activeComparison.products || []}
                    winner={(activeComparison.products || []).find((p) => p.product_id === activeComparison.winner_product_id) || null}
                    battleReport={activeComparison.rationale}
                    onSelectWinner={(winProd) => handleActionClick('BUY', winProd)}
                  />
                  <ComparisonMatrixCard matrix={activeComparison} onAction={handleActionClick} />
                </div>
              ) : activeCart ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Two-Phase Commit (2PC) Hold Active</span>
                  </div>
                  <PurchaseConfirmationCard
                    cart={activeCart}
                    zipCode={zipCode}
                    onViewFullCart={onOpenCart}
                    onConfirmPurchase={handlePurchaseConfirmedInternal}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-slate-400 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    <Scale className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    No Contenders Selected
                  </h4>
                  <p className="text-xs max-w-xs leading-relaxed">
                    Click <strong>[⚖️ Select]</strong> on two or more product cards to compare specs side-by-side in this live arena.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </BuyerToolCallbacksProvider>
    </AssistantRuntimeProvider>
  );
}
