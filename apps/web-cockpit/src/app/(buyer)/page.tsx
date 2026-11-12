'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { webLogger as logger } from '@/lib/logger';
import { GenerativeIntentBar, ParsedSearchIntent } from '@/components/buyer/GenerativeIntentBar';
import { ThoughtStreamVisualizer, ThoughtStep } from '@/components/buyer/ThoughtStreamVisualizer';
import { CryptographicMandateSigner } from '@/components/buyer/CryptographicMandateSigner';
import { KnapsackSplitVisualizer, KnapsackOptimizationData } from '@/components/buyer/KnapsackSplitVisualizer';
import { SyntheticIntentBidder } from '@/components/buyer/SyntheticIntentBidder';
import { PayPalV6SdkMount } from '@/components/buyer/PayPalV6SdkMount';
import { HitlApprovalModal, HitlPushApprovalRequest } from '@/components/buyer/HitlApprovalModal';
import { FriendlyErrorTransmuter } from '@/components/common/FriendlyErrorTransmuter';
import { ConversationalAgentChat } from '@/components/buyer/ConversationalAgentChat';
import { BuyerSidebar } from '@/components/buyer/BuyerSidebar';
import { SpendAllowanceHeader } from '@/components/buyer/SpendAllowanceHeader';
import { UserSettingsDrawer, UserSettings, DEFAULT_USER_SETTINGS, COMMERCE_MODELS } from '@/components/buyer/UserSettingsDrawer';
import { UnifiedCartDrawer, OrderConfirmationData } from '@/components/buyer/UnifiedCartDrawer';
import type { SessionMandate, ProductCardData } from '@aegispay/shared-types';
import {
  Sparkles,
  Activity,
  Layers,
  Terminal,
  ShieldCheck,
  ShoppingBag,
  MessageSquare,
  X,
  Sliders,
  Code,
  Bot,
  Key,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';

export default function BuyerPortalPage() {
  const router = useRouter();
  const { showTechnicalDetails } = useUiMode();
  const {
    user,
    isLoggedIn,
    isAuthorized,
    isTrackingMode,
    loginWithPayPal,
    authorizePayment,
    openProfileSidebar,
    spentCents,
    recordPurchaseSpend,
  } = useAuth();
  const [activeMandate, setActiveMandate] = useState<SessionMandate | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSolvingIntent, setIsSolvingIntent] = useState<boolean>(false);
  const [shouldRunTrace, setShouldRunTrace] = useState<boolean>(false);
  const [externalBudgetCents, setExternalBudgetCents] = useState<number>(50000);

  // Clear active mandate when Dev Mode is turned OFF so no old signed tokens linger
  useEffect(() => {
    if (!showTechnicalDetails) {
      setActiveMandate(null);
    }
  }, [showTechnicalDetails]);

  // Cart Drawer state
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<OrderConfirmationData | null>(null);

  // User Settings State & Drawer
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Left Collapsible Sidebar state & Developer Modal state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isDevModalOpen, setIsDevModalOpen] = useState<boolean>(false);
  const [devModalTab, setDevModalTab] = useState<'signer' | 'settings'>('signer');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Deep Observability Lifecycle Mount Logging
  useEffect(() => {
    logger.info('[BuyerPage:Mount] Buyer portal mounted', {
      showTechnicalDetails,
      initialBudgetCents: externalBudgetCents,
      initialSpentCents: spentCents,
      cartItemCount: optimizationData.assigned_merchants.reduce(
        (acc, m) => acc + m.items.reduce((iAcc, item) => iAcc + item.quantity, 0),
        0
      ),
      hasActiveMandate: !!activeMandate,
    });

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlQuery = searchParams.get('q');
      const urlBudget = searchParams.get('budget');
      const urlModel = searchParams.get('model');
      logger.debug('[BuyerPage:Params] Parsed URL search parameters', {
        urlQuery,
        urlBudget,
        urlModel,
        rawSearch: window.location.search,
      });

      if (urlBudget) {
        const parsedBudget = Number(urlBudget);
        if (!isNaN(parsedBudget) && parsedBudget > 0) {
          logger.info('[BuyerPage:Params] Overriding external budget from URL parameter', {
            previousBudget: externalBudgetCents,
            newBudget: parsedBudget,
          });
          setExternalBudgetCents(parsedBudget);
        } else {
          logger.warn('[BuyerPage:Params] Invalid URL budget param encountered', { urlBudget });
        }
      }
    }
  }, []);

  // Knapsack state
  const [optimizationData, setOptimizationData] = useState<KnapsackOptimizationData>({
    assigned_merchants: [
      {
        merchant_domain: 'audio-gear-direct.com',
        delivery_window: '2-Day Express Consolidated',
        estimated_arrival: 'Est. Delivery in 2 business days',
        subtotal_cents: 28000,
        commission_rebate_cents: 3150,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 25000,
        net_merchant_cents: 24850,
        items: [
          {
            product_id: 'ch3_anc_headphone_01',
            title: 'AcousticPro ANC Studio Headphones (Midnight)',
            quantity: 1,
            unit_price_cents: 28000,
            unit_compare_price_cents: 34999,
            commission_rate: 0.15,
            cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
          },
        ],
      },
      {
        merchant_domain: 'nordic-workspaces.io',
        delivery_window: '3-4 Day Priority Freight',
        estimated_arrival: 'Est. Delivery in 3-4 business days',
        subtotal_cents: 19500,
        commission_rebate_cents: 1755,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 15000,
        net_merchant_cents: 17745,
        items: [
          {
            product_id: 'ch3_desk_mat_walnut',
            title: 'Precision Felt & Walnut Desk Organizer Pad',
            quantity: 1,
            unit_price_cents: 8500,
            unit_compare_price_cents: 11000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80',
          },
          {
            product_id: 'ch3_usb_dac_amp',
            title: 'Hi-Fi 32-bit USB Audio DAC/Amp Interface',
            quantity: 1,
            unit_price_cents: 11000,
            unit_compare_price_cents: 14000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80',
          },
        ],
      },
    ],
    gross_subtotal_cents: 47500,
    total_commission_rebate_cents: 4905,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 2500,
    net_buyer_expenditure_cents: 42595,
    savings_percentage: 29.0,
    is_within_budget: true,
    budget_cap_cents: 50000,
  });

  const showNotification = (msg: string) => {
    logger.debug('[BuyerPage:Notification] Displaying notification toast', { message: msg });
    setNotification(msg);
    setTimeout(() => {
      logger.debug('[BuyerPage:Notification] Dismissing notification toast', { message: msg });
      setNotification(null);
    }, 3500);
  };

  const handleMandateGenerated = (mandate: SessionMandate) => {
    logger.info('[BuyerPage:Mandate] Received newly signed Ed25519 session mandate', {
      mandateId: mandate.mandate_id,
      buyerId: mandate.buyer_id,
      maxTotalSpendCents: mandate.max_total_spend_cents,
      maxSingleMerchantCents: mandate.max_single_merchant_cents,
      allowedCategories: mandate.allowed_category_ids,
      expiresAt: mandate.expires_at,
    });
    setActiveMandate(mandate);
    showNotification(`New Ed25519 Mandate signed: ${mandate.mandate_id}`);
    setOptimizationData((prev) => {
      const isWithinBudget = prev.net_buyer_expenditure_cents <= mandate.max_total_spend_cents;
      const overagePercentage = !isWithinBudget
        ? Number(
            (
              ((prev.net_buyer_expenditure_cents - mandate.max_total_spend_cents) /
                mandate.max_total_spend_cents) *
              100
            ).toFixed(2)
          )
        : undefined;

      logger.debug('[BuyerPage:OptimizationUpdate] Re-evaluating knapsack budget envelope with mandate', {
        mandateBudgetCap: mandate.max_total_spend_cents,
        netBuyerExpenditure: prev.net_buyer_expenditure_cents,
        isWithinBudget,
        overagePercentage,
      });

      return {
        ...prev,
        budget_cap_cents: mandate.max_total_spend_cents,
        is_within_budget: isWithinBudget,
        overage_percentage: overagePercentage,
      };
    });
  };

  const handleIntentSearch = (intent: ParsedSearchIntent) => {
    logger.info('[BuyerPage:IntentSearch] Executing intent search', {
      rawQuery: intent.rawQuery,
      maxBudgetCents: intent.maxBudgetCents,
      categoryIds: intent.categoryIds,
    });
    setIsSolvingIntent(true);
    setShouldRunTrace(true);
    setExternalBudgetCents(intent.maxBudgetCents);
    showNotification(`Parsing query: "${intent.rawQuery.slice(0, 42)}..." with budget ${formatCents(intent.maxBudgetCents)}`);

    setTimeout(() => {
      logger.info('[BuyerPage:IntentSearch] Knapsack solver completed simulation', {
        maxBudgetCents: intent.maxBudgetCents,
        projectedExpenditure: 42595,
      });
      setIsSolvingIntent(false);
      setShouldRunTrace(false);

      // Dynamically tune knapsack cart based on intent
      const isOverBudget = 42595 > intent.maxBudgetCents;
      const overagePercentage = isOverBudget
        ? Number((((42595 - intent.maxBudgetCents) / intent.maxBudgetCents) * 100).toFixed(2))
        : undefined;

      logger.debug('[BuyerPage:KnapsackResult] Knapsack dynamic update evaluated', {
        isOverBudget,
        overagePercentage,
        maxBudgetCents: intent.maxBudgetCents,
      });

      setOptimizationData((prev) => ({
        ...prev,
        budget_cap_cents: intent.maxBudgetCents,
        is_within_budget: !isOverBudget,
        overage_percentage: overagePercentage,
      }));

      showNotification(`Channel3 search matched 14 offers across 3 merchants. Knapsack solved!`);
    }, 2200);
  };

  const handleSelectProductForBuy = (product: ProductCardData) => {
    // 1. Verify Allowed Merchants Whitelist
    const allowedMerchants = user?.allowedMerchants;
    if (allowedMerchants && allowedMerchants.length > 0 && !allowedMerchants.includes('*')) {
      const pDomain = (product.merchant_domain || '').toLowerCase().replace(/^www\./, '');
      const isAllowed = allowedMerchants.some((m) => {
        const mDomain = m.trim().toLowerCase().replace(/^www\./, '');
        return pDomain === mDomain || pDomain.includes(mDomain) || mDomain.includes(pDomain);
      });
      if (!isAllowed) {
        showNotification(`⛔ Store "${product.merchant_domain}" is not in your authorized merchant whitelist.`);
        return;
      }
    }

    // 2. Verify Allowed Categories
    const allowedCats = user?.allowedCategories;
    if (allowedCats && allowedCats.length > 0 && !allowedCats.includes('*')) {
      if (product.category_id) {
        const isAllowed = allowedCats.some(
          (c) => c.toLowerCase() === product.category_id.toLowerCase() || product.category_id.toLowerCase().includes(c.toLowerCase())
        );
        if (!isAllowed) {
          showNotification(`⛔ Category "${product.category_id}" is not permitted under your active spend mandate.`);
          return;
        }
      }
    }

    const netPrice = product.price_cents - (product.commission_rebate_cents || 0);
    logger.info('[BuyerPage:Buy] Product selected for purchase', {
      productId: product.product_id,
      title: product.title,
      priceCents: product.price_cents,
      commissionRebateCents: product.commission_rebate_cents,
      netPriceCents: netPrice,
      merchantDomain: product.merchant_domain,
    });
    showNotification(`Pre-purchase reservation hold initiated for ${product.title}`);
    recordPurchaseSpend(netPrice);
    setIsCartOpen(true);
  };

  const handleRemoveCartItem = (productId: string) => {
    logger.info('[BuyerPage:RemoveItem] Removing item from knapsack cart', { productId });
    setOptimizationData((prev) => {
      let removedTitle = 'Item';
      const updatedMerchants = (prev?.assigned_merchants || [])
        .map((merchant) => {
          const remainingItems = (merchant?.items || []).filter((it) => {
            if (it.product_id === productId) {
              removedTitle = it.title;
              return false;
            }
            return true;
          });
          if (remainingItems.length === 0) return null;

          const merchantSubtotal = remainingItems.reduce((acc, it) => acc + it.unit_price_cents * it.quantity, 0);
          const merchantRebate = remainingItems.reduce(
            (acc, it) => acc + Math.round(it.unit_price_cents * it.commission_rate * 0.75 * it.quantity),
            0
          );
          const isShippingWaived = merchant.waiver_threshold_cents
            ? merchantSubtotal >= merchant.waiver_threshold_cents
            : true;
          const shippingFee = isShippingWaived ? 0 : (merchant.shipping_fee_cents || 1500);

          return {
            ...merchant,
            items: remainingItems,
            subtotal_cents: merchantSubtotal,
            commission_rebate_cents: merchantRebate,
            shipping_fee_cents: shippingFee,
            shipping_waived: isShippingWaived,
            net_merchant_cents: merchantSubtotal - merchantRebate + shippingFee,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      const grossSubtotal = updatedMerchants.reduce((acc, m) => acc + m.subtotal_cents, 0);
      const totalRebate = updatedMerchants.reduce((acc, m) => acc + m.commission_rebate_cents, 0);
      const totalShipping = updatedMerchants.reduce((acc, m) => acc + m.shipping_fee_cents, 0);
      const netBuyer = grossSubtotal - totalRebate + totalShipping;
      const savingsPct = grossSubtotal > 0 ? Number(((totalRebate / grossSubtotal) * 100).toFixed(1)) : 0;
      const budgetCap = prev.budget_cap_cents || 50000;
      const isWithinBudget = netBuyer <= budgetCap;

      showNotification(`Removed "${removedTitle.slice(0, 32)}..." from cart`);

      return {
        ...prev,
        assigned_merchants: updatedMerchants,
        gross_subtotal_cents: grossSubtotal,
        total_commission_rebate_cents: totalRebate,
        total_shipping_cents: totalShipping,
        net_buyer_expenditure_cents: netBuyer,
        savings_percentage: savingsPct,
        is_within_budget: isWithinBudget,
      };
    });
  };

  const cartItemCount = optimizationData.assigned_merchants.reduce(
    (acc, m) => acc + m.items.reduce((iAcc, item) => iAcc + item.quantity, 0),
    0
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] overflow-hidden transition-colors relative">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-cyan-900/95 dark:bg-cyan-950/95 border border-cyan-400 dark:border-cyan-500/50 text-white dark:text-cyan-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in font-mono">
          {notification}
        </div>
      )}

      {/* Main Fullscreen Split-Layout: Left Collapsible Sidebar + Right Fixed Chatbox */}
      <div className="flex-1 min-h-0 flex flex-row w-full h-full overflow-hidden relative">
        {/* Left Collapsible Sidebar with Vertical Budget & User Quick Navigation */}
        <BuyerSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          maxBudgetCents={showTechnicalDetails && activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
          spentCents={spentCents}
          cartItemCount={cartItemCount}
          onOpenSettings={() => {
            logger.info('[BuyerPage:SettingsDrawer] Opening user settings drawer from sidebar');
            setIsSettingsOpen(true);
          }}
          onConnectPayPal={async () => {
            if (!isLoggedIn) {
              await loginWithPayPal();
              showNotification('Logged in with PayPal! Next: Authorize Payment');
            } else if (!isAuthorized) {
              await authorizePayment();
              showNotification('PayPal Payment & Spend Allowance Authorized!');
            } else {
              openProfileSidebar();
            }
          }}
          onOpenCart={() => {
            if (isTrackingMode) {
              showNotification('Cart access and purchases are disabled in read-only tracking mode.');
              return;
            }
            logger.info('[BuyerPage:CartDrawer] Opening cart drawer from sidebar');
            setIsCartOpen(true);
          }}
        />

        {/* Right Main Chatbox Area (Fixed screen, does not slide) */}
        <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative bg-white/40 dark:bg-[#060b14]/40">
          {/* Developer Mode Top Window Banner (Opens Modal Window, doesn't shift chatbox) */}
          {showTechnicalDetails && (
            <div className="px-3 sm:px-4 py-1.5 bg-gradient-to-r from-cyan-950/70 via-slate-900/70 to-blue-950/70 border-b border-cyan-500/20 flex items-center justify-between text-xs text-cyan-300 shrink-0 backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                <span className="font-mono text-[11px] font-bold truncate">
                  Developer & Auditor Mode Active
                </span>
                {activeMandate && (
                  <span className="hidden md:inline font-mono text-[10px] text-cyan-400/80">
                    ({activeMandate.mandate_id})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setDevModalTab('settings');
                    setIsDevModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Developer Settings</span>
                  <span className="sm:hidden">Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDevModalTab('signer');
                    setIsDevModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Hardware Signer</span>
                  <span className="sm:hidden">Signer</span>
                </button>
              </div>
            </div>
          )}

          {/* Fixed Chatbox (fills entire height smoothly, only message content scrolls) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ConversationalAgentChat
              budgetCapCents={showTechnicalDetails && activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
              zipCode={userSettings.zipCode}
              developerModeEnabled={userSettings.developerModeEnabled}
              selectedModel={userSettings.aiModel}
              userApiKey={userSettings.userApiKey}
              cartItemCount={cartItemCount}
              cartSubtotalCents={optimizationData.net_buyer_expenditure_cents}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onOpenCart={() => {
                if (isTrackingMode) {
                  showNotification('Cart access and purchases are disabled in read-only tracking mode.');
                  return;
                }
                logger.info('[BuyerPage:CartDrawer] Opening cart drawer from chat recommendation');
                setIsCartOpen(true);
              }}
              onPurchaseConfirmed={(result) => {
                logger.info('[BuyerPage:Purchase] Purchase confirmed from chat flow', {
                  orderId: result.orderId,
                  authorizedCents: result.authorizedCents,
                });
                recordPurchaseSpend(result.authorizedCents);
                showNotification(`1-Click Vaulted Order ${result.orderId} Authorized!`);
              }}
              onSelectProductForBuy={handleSelectProductForBuy}
              onSelectProductForDetails={(p) => {
                logger.debug('[BuyerPage:Details] Product details inspected from chat', {
                  productId: p.product_id,
                  title: p.title,
                });
                showNotification(`Loaded technical specifications for ${p.title}`);
              }}
              onSelectProductForCompare={(p) => {
                logger.debug('[BuyerPage:Compare] Comparison matrix viewed from chat', {
                  productId: p.product_id,
                  title: p.title,
                });
                showNotification(`Generated side-by-side comparison matrix for ${p.title}`);
              }}
            />
          </div>
        </main>
      </div>

      {/* Developer Hardware Signer & Settings Modal Window (Closes on outside click or X button) */}
      {showTechnicalDetails && isDevModalOpen && (
        <div
          onClick={() => setIsDevModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-[#091122] border border-cyan-500/40 rounded-2xl p-5 shadow-2xl relative space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Developer & Auditor Cockpit
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Deterministic SPKI Mandates, LLM Configuration & Hardware Spend Signer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDevModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Window Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDevModalTab('signer')}
                className={`pb-2 transition-colors border-b-2 cursor-pointer ${
                  devModalTab === 'signer'
                    ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Hardware Signer (Ed25519)
              </button>
              <button
                type="button"
                onClick={() => setDevModalTab('settings')}
                className={`pb-2 transition-colors border-b-2 cursor-pointer ${
                  devModalTab === 'settings'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Developer Settings & BYOK
              </button>
            </div>

            {devModalTab === 'signer' ? (
              <CryptographicMandateSigner
                onMandateGenerated={(mandate) => {
                  handleMandateGenerated(mandate);
                  setIsDevModalOpen(false);
                }}
                externalBudgetCents={externalBudgetCents}
              />
            ) : (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-bold">Active LLM Reasoning Engine: </span>
                  <span className="font-mono">{userSettings.aiModel || 'google/gemini-3.5-flash-lite'}</span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Select a model below. Default Google models use pre-configured platform credentials.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Choose Commerce Reasoning Model
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {COMMERCE_MODELS.map((m) => {
                      const isSelected = (userSettings.aiModel || 'google/gemini-3.5-flash-lite') === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setUserSettings((prev) => ({
                              ...prev,
                              aiModel: m.id,
                              developerModeEnabled: true,
                            }));
                            showNotification(`Switched model to ${m.name}`);
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white ring-1 ring-amber-500/40'
                              : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/40 bg-slate-50/50 dark:bg-slate-900/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">{m.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {m.provider}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                            {m.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDevModalOpen(false);
                      setIsSettingsOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 cursor-pointer transition-colors"
                  >
                    Open Full Settings Drawer ↗
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDevModalOpen(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 cursor-pointer shadow-xs transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Settings Drawer */}
      <UserSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => {
          logger.info('[BuyerPage:SettingsDrawer] Closing user settings drawer');
          setIsSettingsOpen(false);
        }}
        settings={userSettings}
        maxBudgetCents={activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
        onSave={(newSettings) => {
          logger.info('[BuyerPage:SettingsDrawer] User settings saved', {
            city: newSettings.city,
            state: newSettings.state,
            zipCode: newSettings.zipCode,
            fulfillmentMode: newSettings.fulfillmentMode,
            purchasingRule: newSettings.purchasingRule,
            autoBuyThresholdCents: newSettings.autoBuyThresholdCents,
            aiModel: newSettings.aiModel,
            developerModeEnabled: newSettings.developerModeEnabled,
          });
          setUserSettings(newSettings);
          showNotification(`Settings updated: Shipping to ${newSettings.city}, ${newSettings.state} (${newSettings.zipCode})`);
        }}
      />

      {/* Multi-Store Cart Drawer */}
      <UnifiedCartDrawer
        isOpen={isCartOpen}
        onClose={() => {
          logger.info('[BuyerPage:CartDrawer] Closing multi-vendor cart drawer');
          setConfirmationData(null);
          setIsCartOpen(false);
        }}
        cart={optimizationData}
        zipCode={userSettings.zipCode}
        onRemoveItem={handleRemoveCartItem}
        isCheckingOut={isCheckingOut}
        confirmationData={confirmationData}
        onContinueShopping={() => {
          setConfirmationData(null);
          setIsCartOpen(false);
        }}
        onViewOrders={() => {
          setConfirmationData(null);
          setIsCartOpen(false);
          router.push('/history');
        }}
        onProceedToCheckout={async () => {
          const totalCents = optimizationData.net_buyer_expenditure_cents;
          const firstMerchant = optimizationData.assigned_merchants[0];
          const firstItem = firstMerchant?.items?.[0];
          const effectiveUserId = user?.email || (user as any)?.id || 'demo';
          const clientOrderId = `ord_pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const allItems = (optimizationData?.assigned_merchants || []).flatMap((m) => m?.items || []);
          const totalItemCount = allItems.reduce((acc, it) => acc + (it?.quantity || 1), 0);

          setIsCheckingOut(true);

          logger.info('[BuyerPage:Checkout] Proceed to checkout triggered from UnifiedCartDrawer', {
            clientOrderId,
            effectiveUserId,
            netBuyerExpenditureCents: totalCents,
            merchantCount: optimizationData.assigned_merchants.length,
          });

          try {
            const res = await fetch('/api/buyer/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': effectiveUserId,
              },
              body: JSON.stringify({
                message: `Order checkout for ${firstItem?.title || 'cart items'}`,
                action: 'BUY',
                order_id: clientOrderId,
                cart: optimizationData,
                items: allItems,
                selected_product_ids: allItems.map((i) => i?.product_id).filter(Boolean),
                budget_cap_cents: totalCents + 5000,
                allowed_category_ids: user?.allowedCategories,
                allowed_merchants: user?.allowedMerchants,
              }),
            });

            const data = await res.json().catch(() => ({}));
            const finalOrderId = data.order_id || clientOrderId;
            const finalTrackingNumber =
              data.tracking_number || `FDX-${Math.floor(100000000000 + Math.random() * 900000000000)}`;
            const finalReceiptNumber = data.receipt_number || Math.floor(1000 + Math.random() * 9000);
            const isFailed = data.order_status === 'FAILED' || !res.ok;

            if (!isFailed) {
              recordPurchaseSpend(totalCents);
              setOptimizationData({
                assigned_merchants: [],
                gross_subtotal_cents: 0,
                total_commission_rebate_cents: 0,
                total_shipping_cents: 0,
                total_shipping_saved_cents: 0,
                net_buyer_expenditure_cents: 0,
                savings_percentage: 0,
                is_within_budget: true,
                budget_cap_cents: 50000,
              });
              setConfirmationData({
                orderId: finalOrderId,
                receiptNumber: finalReceiptNumber,
                trackingNumber: finalTrackingNumber,
                carrier: 'FedEx Priority',
                totalCents,
                itemCount: totalItemCount,
                isFailed: false,
              });
              showNotification(`Order authorized! Saved to order history for ${effectiveUserId}`);
            } else {
              setConfirmationData({
                orderId: finalOrderId,
                totalCents,
                itemCount: totalItemCount,
                isFailed: true,
                errorMessage:
                  data.message ||
                  data.error ||
                  'Order declined by security enforcer policy or budget constraint. Recorded as FAILED.',
              });
            }
          } catch (err: any) {
            logger.warn('Failed to dispatch checkout via buyer chat', { error: err?.message });
            setConfirmationData({
              orderId: clientOrderId,
              totalCents,
              itemCount: totalItemCount,
              isFailed: true,
              errorMessage: err?.message || 'Network error attempting checkout authorization.',
            });
          } finally {
            setIsCheckingOut(false);
          }
        }}
      />

    </div>
  );
}
