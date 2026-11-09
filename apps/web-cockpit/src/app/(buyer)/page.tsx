'use client';

import React, { useState } from 'react';
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

export default function BuyerPortalPage() {
  const { showTechnicalDetails } = useUiMode();
  const [activeMandate, setActiveMandate] = useState<SessionMandate | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSolvingIntent, setIsSolvingIntent] = useState<boolean>(false);
  const [shouldRunTrace, setShouldRunTrace] = useState<boolean>(false);
  const [externalBudgetCents, setExternalBudgetCents] = useState<number>(50000);
  const [spentCents, setSpentCents] = useState<number>(8500);

  // Cart Drawer state
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // User Settings State & Drawer
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleMandateGenerated = (mandate: SessionMandate) => {
    setActiveMandate(mandate);
    showNotification(`New Ed25519 Mandate signed: ${mandate.mandate_id}`);
    setOptimizationData((prev) => ({
      ...prev,
      budget_cap_cents: mandate.max_total_spend_cents,
      is_within_budget: prev.net_buyer_expenditure_cents <= mandate.max_total_spend_cents,
      overage_percentage:
        prev.net_buyer_expenditure_cents > mandate.max_total_spend_cents
          ? Number(
              (
                ((prev.net_buyer_expenditure_cents - mandate.max_total_spend_cents) /
                  mandate.max_total_spend_cents) *
                100
              ).toFixed(2)
            )
          : undefined,
    }));
  };

  const handleIntentSearch = (intent: ParsedSearchIntent) => {
    setIsSolvingIntent(true);
    setShouldRunTrace(true);
    setExternalBudgetCents(intent.maxBudgetCents);
    showNotification(`Parsing query: "${intent.rawQuery.slice(0, 42)}..." with budget ${formatCents(intent.maxBudgetCents)}`);

    setTimeout(() => {
      setIsSolvingIntent(false);
      setShouldRunTrace(false);

      // Dynamically tune knapsack cart based on intent
      const isOverBudget = 42595 > intent.maxBudgetCents;
      setOptimizationData((prev) => ({
        ...prev,
        budget_cap_cents: intent.maxBudgetCents,
        is_within_budget: !isOverBudget,
        overage_percentage: isOverBudget
          ? Number((((42595 - intent.maxBudgetCents) / intent.maxBudgetCents) * 100).toFixed(2))
          : undefined,
      }));

      showNotification(`Channel3 search matched 14 offers across 3 merchants. Knapsack solved!`);
    }, 2200);
  };

  const handleSelectProductForBuy = (product: ProductCardData) => {
    showNotification(`Pre-purchase reservation hold initiated for ${product.title}`);
    setSpentCents((prev) => prev + (product.price_cents - product.commission_rebate_cents));
    setIsCartOpen(true);
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
            <button
              onClick={() => setIsCartOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 font-bold hover:bg-cyan-500/25 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-cyan-500" />
              <span>
                {showTechnicalDetails ? 'Multi-Vendor Cart' : 'Multi-Store Cart'} ({cartItemCount})
              </span>
            </button>
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
          maxBudgetCents={activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
          spentCents={spentCents}
          isConfigured={!!activeMandate}
          cartItemCount={cartItemCount}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenCart={() => setIsCartOpen(true)}
          onConnectPayPal={() => {
            showNotification('Connecting to Vault v3 pre-authorization...');
          }}
        />

        {/* Main Consumer Shopping Concierge Chat */}
        <section className="space-y-6">
          <ConversationalAgentChat
            budgetCapCents={activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
            zipCode={userSettings.zipCode}
            developerModeEnabled={userSettings.developerModeEnabled}
            selectedModel={userSettings.aiModel}
            userApiKey={userSettings.userApiKey}
            onOpenCart={() => setIsCartOpen(true)}
            onPurchaseConfirmed={(result) => {
              setSpentCents((prev) => prev + result.authorizedCents);
              showNotification(`1-Click Vaulted Order ${result.orderId} Authorized!`);
            }}
            onSelectProductForBuy={handleSelectProductForBuy}
            onSelectProductForDetails={(p) => {
              showNotification(`Loaded technical specifications for ${p.title}`);
            }}
            onSelectProductForCompare={(p) => {
              showNotification(`Generated side-by-side comparison matrix for ${p.title}`);
            }}
          />
        </section>

        {/* Spending Limits & Protection Drawer (Collapsible) */}
        <div className="pt-2">
          <details className="group border border-slate-200 dark:border-slate-800 rounded-2xl bg-white/70 dark:bg-[#070e1c]/70 p-4 transition-colors">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between list-none">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {showTechnicalDetails
                    ? '▾ Inspect Cryptographic Proofs & Hardware Spend Signer (Ed25519) — For Auditors'
                    : '▾ Spending Limit & Security Settings'}
                </span>
              </span>
              <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                {showTechnicalDetails
                  ? (activeMandate?.mandate_id || 'Active Hardware Key')
                  : 'Protected by PayPal'}
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
      </main>

      {/* User Settings Drawer */}
      <UserSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={userSettings}
        maxBudgetCents={activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
        onSave={(newSettings) => {
          setUserSettings(newSettings);
          showNotification(`Settings updated: Shipping to ${newSettings.city}, ${newSettings.state} (${newSettings.zipCode})`);
        }}
      />

      {/* Multi-Store Cart Drawer */}
      <UnifiedCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={optimizationData}
        zipCode={userSettings.zipCode}
        onProceedToCheckout={() => {
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
