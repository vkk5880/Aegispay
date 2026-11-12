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
  Sliders,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';
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
  SideBySideProductColumns,
} from './BuyerGenerativeTools';
import { BattleArena } from './BattleArena';
import { PurchaseConfirmationCard } from './PurchaseConfirmationCard';
import { getProductImageUrl } from '@/lib/productImageHelper';

// Maximum allowed products for side-by-side comparison
export const MAX_SELECTED_PRODUCTS = 4;

export const DEMO_COMPARISON_PRODUCTS: ProductCardData[] = [
  {
    product_id: 'ch3_anc_headphone_01',
    title: 'AcousticPro ANC Studio Headphones (Midnight)',
    price_cents: 28000,
    merchant_domain: 'audio-gear-direct.com',
    rating: '4.9',
    free_shipping: true,
    commission_rebate_cents: 3150,
    merchant_credibility_score: 98,
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
    specs: {
      battery_life: '36 hours',
      anc_modes: 'Hybrid ANC (40dB)',
      connectivity: 'Bluetooth 5.3 + 3.5mm lossless',
    },
  },
  {
    product_id: 'ch3_usb_dac_amp',
    title: 'Hi-Fi 32-bit USB Audio DAC/Amp Interface',
    price_cents: 11000,
    merchant_domain: 'nordic-workspaces.io',
    rating: '4.8',
    free_shipping: true,
    commission_rebate_cents: 1755,
    merchant_credibility_score: 95,
    image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80',
    specs: {
      resolution: '32-bit / 384kHz DSD256',
      output_power: '240mW @ 32 ohms',
      connectivity: 'USB-C to 3.5mm / 4.4mm balanced',
    },
  },
];

// Re-export for 100% backward compatibility
export { GenerativeProductCard as ProductCard, ComparisonMatrixCard, SideBySideProductColumns };
export type { GenerativeProductCardProps as ProductCardProps, ComparisonMatrixCardProps, SideBySideProductColumnsProps } from './BuyerGenerativeTools';

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
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
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
  isSidebarOpen = true,
  onToggleSidebar,
}: ConversationalAgentChatProps) {
  const { user } = useAuth();
  const { showTechnicalDetails } = useUiMode();
  const developerModeEnabled = devProp || showTechnicalDetails;

  const [inputMessage, setInputMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductCardData[]>([]);
  const [discoveredProducts, setDiscoveredProducts] = useState<ProductCardData[]>([]);
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
            // Filter to only messages that have valid role and content
            const valid = parsed.filter(
              (m) => m && (m.role === 'user' || m.role === 'assistant') && m.content
            );
            // Ensure every message has an id and valid structured content
            const sanitized = valid.map((m, idx) => ({
              id: m.id || `msg_restored_${idx}`,
              role: m.role,
              content: typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content,
            }));
            // Drop trailing user message if there is no assistant response to avoid broken thread state
            while (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
              sanitized.pop();
            }
            if (sanitized.length > 0) {
              logger.info('[BuyerChat:Storage] Restored saved chat history from localStorage', {
                messageCount: sanitized.length,
              });
              return sanitized;
            }
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

  // Auto-scroll chat viewport to latest content whenever discovered products, comparisons, or message streaming updates
  useEffect(() => {
    const el = viewportEndRef.current;
    if (el) {
      const scrollContainer = (el.closest('.overflow-y-auto') as HTMLElement | null) || el.parentElement;
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [discoveredProducts.length, activeComparison, activeCart, isSubmitting]);

  // Handle Multi-Select Product Toggle (Enforces MAX_SELECTED_PRODUCTS limit)
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
        if (prev.length >= MAX_SELECTED_PRODUCTS) {
          logger.warn('[BuyerChat:MultiSelect] Maximum products limit reached', {
            limit: MAX_SELECTED_PRODUCTS,
          });
          return prev;
        }
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
    getActiveTurnProducts: () => activeTurnProductsRef.current || [],
    getSelectedProductIds: () => (selectedProducts || []).map((p) => p.product_id),
    budgetCapCents,
    zipCode,
    developerModeEnabled,
    selectedModel,
    userApiKey,
    allowedCategories: user?.allowedCategories,
    allowedMerchants: user?.allowedMerchants,
    initialMessages: savedMessages,
    onTurnProductsReceived: (products) => {
      const safeProducts = Array.isArray(products) ? products : [];
      logger.info('[BuyerChat:TurnProducts] Grounded turn products bound to context', { count: safeProducts.length });
      setDiscoveredProducts(safeProducts);
      activeTurnProductsRef.current = safeProducts.map((p, idx) => ({
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

  const handleSendMessage = async (textToSend?: string) => {
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
    if (!textToSend) setInputMessage('');

    try {
      if (runtime.thread && typeof runtime.thread.append === 'function') {
        await runtime.thread.append(messageText);
      } else if (runtime.thread?.composer) {
        runtime.thread.composer.setText(messageText);
        runtime.thread.composer.send();
      }
    } catch (err: any) {
      logger.error('[BuyerChat:Send] Failed to send message to assistant-ui thread', { error: err?.message });
      // Restore input text if send failed so user does not lose input
      if (!textToSend) setInputMessage(text);
    } finally {
      setIsSubmitting(false);
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
        <div className="flex-1 flex flex-col lg:flex-row h-full w-full min-h-0 min-w-0 bg-white/70 dark:bg-[#070d1a]/90 overflow-hidden backdrop-blur-md transition-all">
          {/* Main Left Panel: Conversation Thread & Input Bar */}
          <div
            className={`flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
              isSidePanelOpen ? 'lg:w-3/5 w-full' : 'w-full'
            }`}
          >
            {/* Thread Header Toolbar */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#081124] dark:to-[#0a152e] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                {onToggleSidebar && (
                  <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="p-1.5 sm:p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    title={isSidebarOpen ? 'Collapse Budget & Menu' : 'Expand Budget & Menu'}
                  >
                    <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="hidden sm:inline text-xs font-semibold">
                      {isSidebarOpen ? 'Hide Menu' : 'Budget & Menu'}
                    </span>
                  </button>
                )}

                <div className="relative">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                      AegisPay
                    </h3>
                    {showTechnicalDetails && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                        Mastra SSE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <span>your ai shopping assistant</span>
                    {showTechnicalDetails && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[10px]">Cap: {formatCents(budgetCapCents)}</span>
                      </>
                    )}
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
            <ThreadPrimitive.Root className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative">
              <ThreadPrimitive.Viewport
                className="flex-1 min-h-0 min-w-0 h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4 space-y-4 scroll-smooth"
                style={{ minHeight: 0 }}
              >
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
                                    tools: {
                                      by_name: {
                                        search_catalog: SearchCatalogToolUI.unstable_tool.render,
                                        discover_products: DiscoverProductsToolUI.unstable_tool.render,
                                        filter_turn_products: FilterTurnProductsToolUI.unstable_tool.render,
                                        compare_products: CompareProductsToolUI.unstable_tool.render,
                                        prepare_checkout: PrepareCheckoutToolUI.unstable_tool.render,
                                      },
                                    },
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </MessagePrimitive.If>

                        {/* Error State Rendering */}
                        <MessagePrimitive.Error>
                          <div className="flex items-center gap-2 p-3 my-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                            <span>Failed to generate response. Please try rephrasing or click a suggestion below.</span>
                          </div>
                        </MessagePrimitive.Error>
                      </MessagePrimitive.Root>
                    ),
                  }}
                />
                <div ref={viewportEndRef} />
              </ThreadPrimitive.Viewport>

              {/* Follow-up Quick Suggestion Chips */}
              {promptSuggestions.length > 0 && (
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
              )}

              {/* Phase 3 Interactive Multi-Chip ChatInputBar */}
              <div className="shrink-0 min-w-0 z-20">
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

          {/* Right Panel: Split-Screen Cockpit Arena / Comparison / Cart Drawer on Desktop & Mobile Drawer */}
          {isSidePanelOpen && (
            <>
              {/* Mobile overlay backdrop */}
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
                onClick={() => setIsSidePanelOpen(false)}
                aria-hidden="true"
              />

              <div className="fixed top-14 bottom-0 right-0 z-40 w-full sm:w-[480px] max-w-[92vw] lg:static lg:top-0 lg:w-2/5 lg:max-w-none flex flex-col h-[calc(100dvh-3.5rem)] lg:h-full min-h-0 min-w-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070e1c] shadow-2xl lg:shadow-none transition-all">
                {/* Fixed Non-scrolling Header with Guaranteed Visible Close Button */}
                <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-[#070e1c]/95 backdrop-blur-md z-10">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                    <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span>Product Comparison ({selectedProducts.length}/4)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedProducts([])}
                        className="text-[11px] text-slate-500 hover:text-rose-500 font-mono transition-colors cursor-pointer px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsSidePanelOpen(false)}
                      className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 flex items-center gap-1 shadow-xs"
                      title="Close comparison window"
                      aria-label="Close comparison window"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                      <span className="text-xs font-bold hidden sm:inline">Close</span>
                    </button>
                  </div>
                </div>

                {/* Scrollable Body Container */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3 pb-8">
                  {/* 1. Multi-Product Comparison: 2 to 4 Products Selected */}
                  {selectedProducts.length >= 2 ? (
                    <div className="space-y-3">
                      {selectedProducts.length === 2 && (
                        <BattleArena
                          contenders={selectedProducts}
                          battleReport={
                            activeComparison?.rationale ||
                            'Side-by-side spec and value analysis of selected contenders.'
                          }
                          winner={
                            activeComparison?.winner_product_id
                              ? selectedProducts.find(
                                  (p) => p.product_id === activeComparison.winner_product_id
                                )
                              : selectedProducts[0]
                          }
                          onSelectWinner={(winner) => handleActionClick('BUY', winner)}
                        />
                      )}
                      <SideBySideProductColumns
                        products={selectedProducts}
                        onBuy={(winProd) => handleActionClick('BUY', winProd)}
                        onRemove={(prodId) =>
                          setSelectedProducts((prev) => prev.filter((p) => p.product_id !== prodId))
                        }
                      />
                      {activeComparison && (
                        <ComparisonMatrixCard matrix={activeComparison} onAction={handleActionClick} />
                      )}
                      <button
                        type="button"
                        onClick={handleCompareSelected}
                        className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ask AI to Compare Specs</span>
                      </button>
                    </div>
                  ) : selectedProducts.length === 1 ? (
                    /* 2. Single Product Selected: Show details and prompt to add second item */
                    <div className="space-y-3">
                      <SideBySideProductColumns
                        products={selectedProducts}
                        onBuy={(winProd) => handleActionClick('BUY', winProd)}
                        onRemove={() => setSelectedProducts([])}
                      />
                      <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-500/30 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-bold text-cyan-800 dark:text-cyan-300">
                          <Scale className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                          <span>Select 1 More Product to Compare</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          Add a 2nd product from the chat or the list below to unlock full side-by-side comparison.
                        </p>
                        {discoveredProducts.filter((p) => p.product_id !== selectedProducts[0].product_id).length > 0 ? (
                          <div className="pt-2 space-y-1.5 border-t border-cyan-500/20">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-400 font-bold block">
                              Quick Add Contender:
                            </span>
                            {discoveredProducts
                              .filter((p) => p.product_id !== selectedProducts[0].product_id)
                              .slice(0, 3)
                              .map((prod) => (
                                <button
                                  key={prod.product_id}
                                  type="button"
                                  onClick={() => handleToggleSelectProduct(prod)}
                                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500 flex items-center justify-between text-left text-xs transition-colors cursor-pointer"
                                >
                                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2">
                                    {prod.title}
                                  </span>
                                  <span className="text-cyan-600 dark:text-cyan-400 font-bold font-mono text-[11px] shrink-0">
                                    + Compare
                                  </span>
                                </button>
                              ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const demoContender = DEMO_COMPARISON_PRODUCTS.find(
                                (p) => p.product_id !== selectedProducts[0].product_id
                              ) || DEMO_COMPARISON_PRODUCTS[1];
                              handleToggleSelectProduct(demoContender);
                            }}
                            className="w-full py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>+ Add Contender to Compare</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : activeComparison ? (
                    /* 3. Active Comparison Matrix from LLM tool call */
                    <div className="space-y-3">
                      <SideBySideProductColumns
                        products={activeComparison.products || []}
                        onBuy={(winProd) => handleActionClick('BUY', winProd)}
                      />
                      <ComparisonMatrixCard matrix={activeComparison} onAction={handleActionClick} />
                    </div>
                  ) : activeCart ? (
                    /* 4. Active Cart Settlement */
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
                  ) : discoveredProducts.length > 0 ? (
                    /* 5. Discovered Products from Recent Chat Search */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Discovered Products ({discoveredProducts.length})
                        </span>
                        {discoveredProducts.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => setSelectedProducts(discoveredProducts.slice(0, 2))}
                            className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
                          >
                            Compare Top 2
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {discoveredProducts.slice(0, 4).map((p) => (
                          <div
                            key={p.product_id}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getProductImageUrl(p)}
                                alt={p.title}
                                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                              />
                              <div className="min-w-0">
                                <h5 className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                                  {p.title}
                                </h5>
                                <span className="text-[11px] font-mono font-bold text-cyan-600 dark:text-cyan-400">
                                  {formatCents(p.price_cents - (p.commission_rebate_cents || 0))}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleSelectProduct(p)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 font-bold text-xs hover:bg-cyan-50 cursor-pointer shadow-2xs shrink-0"
                            >
                              + Compare
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* 6. Default Welcome & Demo Comparison State (Never Blank!) */
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-500 dark:text-slate-400 space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-sm">
                        <Scale className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                          Side-by-Side Comparison Arena
                        </h4>
                        <p className="text-xs max-w-xs leading-relaxed text-slate-500 dark:text-slate-400 mt-1">
                          Select 2 to 4 products in the chat to compare prices, cashback rebates, and tech specs side-by-side.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedProducts(DEMO_COMPARISON_PRODUCTS)}
                        className="py-2 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Load Demo Comparison</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </BuyerToolCallbacksProvider>
    </AssistantRuntimeProvider>
  );
}
