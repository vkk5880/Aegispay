'use client';

import React, { useState, useEffect } from 'react';
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
import { SpendAllowanceHeader } from '@/components/buyer/SpendAllowanceHeader';
import { UserSettingsDrawer, UserSettings, DEFAULT_USER_SETTINGS } from '@/components/buyer/UserSettingsDrawer';
import { UnifiedCartDrawer } from '@/components/buyer/UnifiedCartDrawer';
import type { SessionMandate, ProductCardData } from '@aegispay/shared-types';
import {
  Sparkles,
  Activity,
  Layers,
  Terminal,
  ShieldCheck,
  ShoppingBag,
  MessageSquare,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';

export default function BuyerPortalPage() {
  const { showTechnicalDetails } = useUiMode();
  const {
    user,
    isLoggedIn,
    isAuthorized,
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

  // User Settings State & Drawer
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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
      const updatedMerchants = prev.assigned_merchants
        .map((merchant) => {
          const remainingItems = merchant.items.filter((it) => {
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
    <div className="flex-1 flex flex-col transition-colors">
      {/* Consumer Protection Status Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#070d18]/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              {showTechnicalDetails ? 'AegisPay Autonomous Consumer Portal' : 'AegisPay Smart Shopping'}
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {showTechnicalDetails
                ? 'One-Time Vault v3 Onboarded • Decoupled Platform Rebates'
                : '1-Click PayPal Checkout • Instant Cashback & Savings'}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {showTechnicalDetails ? 'Atomic Spend Enforcer Active' : 'Budget Protection Active'}
            </span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 bg-cyan-900/95 dark:bg-cyan-950/95 border border-cyan-400 dark:border-cyan-500/50 text-white dark:text-cyan-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in font-mono">
          {notification}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Persistent Spend Allowance Header Bar */}
        <SpendAllowanceHeader
          maxBudgetCents={showTechnicalDetails && activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
          spentCents={spentCents}
          isConfigured={isAuthorized || (showTechnicalDetails && !!activeMandate)}
          onOpenSettings={() => {
            logger.info('[BuyerPage:SettingsDrawer] Opening user settings drawer from spend header');
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
        />

        {/* Main Consumer Shopping Concierge Chat */}
        <section className="space-y-6">
          <ConversationalAgentChat
            budgetCapCents={showTechnicalDetails && activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
            zipCode={userSettings.zipCode}
            developerModeEnabled={userSettings.developerModeEnabled}
            selectedModel={userSettings.aiModel}
            userApiKey={userSettings.userApiKey}
            cartItemCount={cartItemCount}
            cartSubtotalCents={optimizationData.net_buyer_expenditure_cents}
            onOpenCart={() => {
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
        </section>

        {/* Spending Limits & Cryptographic Hardware Signer (Visible only when Dev Mode is ON) */}
        {showTechnicalDetails && (
          <div className="pt-2">
            <details className="group border border-slate-200 dark:border-slate-800 rounded-2xl bg-white/70 dark:bg-[#070e1c]/70 p-4 transition-colors">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between list-none">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>
                    ▾ Inspect Cryptographic Proofs & Hardware Spend Signer (Ed25519) — For Auditors
                  </span>
                </span>
                <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                  {activeMandate?.mandate_id || 'Active Hardware Key'}
                </span>
              </summary>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <CryptographicMandateSigner
                  onMandateGenerated={handleMandateGenerated}
                  externalBudgetCents={externalBudgetCents}
                />
              </div>
            </details>
          </div>
        )}
      </main>

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
          setIsCartOpen(false);
        }}
        cart={optimizationData}
        zipCode={userSettings.zipCode}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => {
          logger.info('[BuyerPage:Checkout] Proceed to checkout triggered from UnifiedCartDrawer', {
            netBuyerExpenditureCents: optimizationData.net_buyer_expenditure_cents,
            merchantCount: optimizationData.assigned_merchants.length,
          });
          setIsCartOpen(false);
          showNotification('1-Click PayPal Authorization initialized!');
        }}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 bg-slate-100 dark:bg-[#080d19]/80 text-center text-xs text-slate-600 dark:text-slate-400 font-mono transition-colors">
        {showTechnicalDetails
          ? 'AegisPay Architecture • Autonomous Dual-Sided Agentic Commerce Platform • Build What\'s Next with PayPal 2026'
          : 'AegisPay • Smart Shopping Assistant & Cashback • Protected by PayPal 2026'}
      </footer>
    </div>
  );
}
