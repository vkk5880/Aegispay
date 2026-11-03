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
import type { SessionMandate, ProductCardData } from '@aegispay/shared-types';
import {
  Sparkles,
  Activity,
  Layers,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  UserCheck,
  AlertOctagon,
  MessageSquare,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

export default function BuyerPortalPage() {
  const [activeMandate, setActiveMandate] = useState<SessionMandate | null>(null);
  const [activeTab, setActiveTab] = useState<'CHAT' | 'OVERVIEW' | 'KNAPSACK' | 'SYNTHETIC' | 'PAYPAL'>('CHAT');
  const [notification, setNotification] = useState<string | null>(null);
  const [isSolvingIntent, setIsSolvingIntent] = useState<boolean>(false);
  const [shouldRunTrace, setShouldRunTrace] = useState<boolean>(false);
  const [externalBudgetCents, setExternalBudgetCents] = useState<number>(50000);
  const [spentCents, setSpentCents] = useState<number>(8500);

  // User Settings State & Drawer
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // HITL Push Approval Modal & Error Transmuter State
  const [hitlRequest, setHitlRequest] = useState<HitlPushApprovalRequest | null>(null);
  const [isHitlOpen, setIsHitlOpen] = useState<boolean>(false);
  const [activeError, setActiveError] = useState<string | null>(null);

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
    setActiveTab('KNAPSACK');
  };

  return (
    <div className="flex-1 flex flex-col transition-colors">
      {/* Sub Navigation Bar for Buyer Views */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#070d18]/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Procurement Views:
            </span>
            <div className="flex items-center gap-1 bg-white dark:bg-[#050912] p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              {[
                { id: 'CHAT', label: 'AI Shopping Concierge', icon: MessageSquare },
                { id: 'OVERVIEW', label: 'Dashboard & Proofs', icon: Layers },
                { id: 'KNAPSACK', label: 'Knapsack Optimizer', icon: Sparkles },
                { id: 'SYNTHETIC', label: 'Synthetic Intent', icon: Activity },
                { id: 'PAYPAL', label: 'PayPal SDK Mount', icon: Terminal },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => {
                setHitlRequest({
                  id: `hitl_demo_${Date.now()}`,
                  type: 'MERCHANT_COUNTER_OFFER',
                  mandate_id: activeMandate?.mandate_id || 'vch_sample_9a2f',
                  title: 'Merchant Counter-Offer Received',
                  message: 'Merchant countered at $465.00 ($15 above bid). Accept counter before timer expires?',
                  original_amount_cents: 45000,
                  requested_amount_cents: 46500,
                  delta_cents: 1500,
                  merchant_domain: 'audio-gear-direct.com',
                  timeout_seconds: 60,
                });
                setIsHitlOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-500/25 transition-all text-[11px]"
              title="Test real-time Human-in-the-Loop push approval modal"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Simulate 60s HITL Push</span>
            </button>

            <button
              onClick={() => {
                setActiveError('ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: Requested $520.00 exceeds current total mandate budget $500.00');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-500/25 transition-all text-[11px]"
              title="Simulate Redis Lua mandate error"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>Simulate Error</span>
            </button>

            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Atomic Spend Enforcer Connected
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
          onOpenSettings={() => setIsSettingsOpen(true)}
          onConnectPayPal={() => {
            setActiveTab('OVERVIEW');
            showNotification('Authorize your Ed25519 mandate to lock in your PayPal Vault allowance');
          }}
        />

        {/* Friendly Error Transmuter Banner */}
        {activeError && (
          <FriendlyErrorTransmuter
            error={activeError}
            onDismiss={() => setActiveError(null)}
            onAction={(actionId) => {
              if (actionId === 'INCREASE_CAP') {
                const newCap = (activeMandate?.max_total_spend_cents || 50000) + 5000;
                setExternalBudgetCents(newCap);
                if (activeMandate) {
                  setActiveMandate({ ...activeMandate, max_total_spend_cents: newCap });
                }
                showNotification(`Mandate cap increased to ${formatCents(newCap)}! Error resolved.`);
                setActiveError(null);
              } else if (actionId === 'FIND_CHEAPER_ALTERNATIVE') {
                showNotification('Agent searching Channel3 for sub-$50 alternative SKU...');
                setActiveError(null);
              } else if (actionId === 'RENEW_MANDATE') {
                showNotification('Mandate renewed for +24 hours with new Ed25519 signature.');
                setActiveError(null);
              } else {
                showNotification(`Action executed: ${actionId}`);
                setActiveError(null);
              }
            }}
          />
        )}

        {/* Tab 1: AI Shopping Concierge Chat */}
        {activeTab === 'CHAT' && (
          <section className="space-y-6">
            <ConversationalAgentChat
              budgetCapCents={activeMandate ? activeMandate.max_total_spend_cents : externalBudgetCents}
              zipCode={userSettings.zipCode}
              onSelectProductForBuy={handleSelectProductForBuy}
              onSelectProductForDetails={(p) => {
                showNotification(`Loading specifications and warranty for ${p.title}`);
              }}
              onSelectProductForCompare={(p) => {
                showNotification(`Generating comparison matrix for ${p.title}`);
              }}
            />
          </section>
        )}

        {/* Tab 2: Generative Intent & Overview Dashboard */}
        {activeTab === 'OVERVIEW' && (
          <section className="space-y-8">
            {/* Banner Section */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-50 via-white to-blue-50 dark:from-blue-950/40 dark:via-[#0b1426] dark:to-cyan-950/40 border border-cyan-200 dark:border-cyan-500/20 shadow-sm dark:shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  Buyer Agent Autonomous Procurement
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30">
                    Section 11.3
                  </span>
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                  Conversational generative procurement powered by Channel3 vector search, Ed25519 cryptographic spend limits,
                  and PayPal Vault v3 synthetic intent bidding.
                </p>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <div className="bg-white dark:bg-[#080d19] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Active Mandate ID</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold">{activeMandate?.mandate_id || 'Unconfigured'}</span>
                </div>
                <div className="bg-white dark:bg-[#080d19] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <span className="text-slate-500 block text-[10px] font-sans font-medium uppercase">Spend Vault Cap</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {activeMandate ? formatCents(activeMandate.max_total_spend_cents) : formatCents(externalBudgetCents)}
                  </span>
                </div>
              </div>
            </div>

            {/* Generative Intent Bar */}
            <GenerativeIntentBar onSearchIntent={handleIntentSearch} isLoading={isSolvingIntent} />

            {/* Streaming Thought Visualizer */}
            <ThoughtStreamVisualizer isRunning={shouldRunTrace} />

            {/* Cryptographic Proofs & Signer */}
            <CryptographicMandateSigner
              onMandateGenerated={handleMandateGenerated}
              externalBudgetCents={externalBudgetCents}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <SyntheticIntentBidder
                mandate={activeMandate}
                basketTotalCents={49000}
                budgetCapCents={activeMandate ? Math.min(activeMandate.max_total_spend_cents, 45000) : 45000}
                onBidAccepted={(res) => {
                  showNotification(`Synthetic bid cleared! PayPal Order: ${res.resulting_paypal_order_id}`);
                }}
              />
              <PayPalV6SdkMount
                orderAmountCents={optimizationData.net_buyer_expenditure_cents}
                orderIntent="AUTHORIZE"
                onAuthorizeSuccess={(orderId) => {
                  showNotification(`Order authorized with PayPal: ${orderId}`);
                }}
              />
            </div>
          </section>
        )}

        {/* Tab 3: Knapsack Multi-Vendor Optimizer */}
        {activeTab === 'KNAPSACK' && (
          <section className="space-y-8">
            <KnapsackSplitVisualizer
              optimization={optimizationData}
              onProceedToAuthorize={() => {
                setActiveTab('PAYPAL');
                showNotification('Proceeding to PayPal JS SDK v6 authorization hold');
              }}
              onTriggerSyntheticBid={() => {
                setActiveTab('SYNTHETIC');
                showNotification('Basket exceeds cap: Launching Synthetic Intent Bidder');
              }}
            />
          </section>
        )}

        {/* Tab 4: Synthetic Intent Negotiation */}
        {activeTab === 'SYNTHETIC' && (
          <SyntheticIntentBidder
            mandate={activeMandate}
            basketTotalCents={49000}
            budgetCapCents={activeMandate ? Math.min(activeMandate.max_total_spend_cents, 45000) : 45000}
            onBidAccepted={(res) => {
              showNotification(`Synthetic bid accepted! Order ID: ${res.resulting_paypal_order_id}`);
            }}
          />
        )}

        {/* Tab 5: PayPal SDK Mount */}
        {activeTab === 'PAYPAL' && (
          <PayPalV6SdkMount
            orderAmountCents={optimizationData.net_buyer_expenditure_cents}
            orderIntent="AUTHORIZE"
            onAuthorizeSuccess={(orderId) => {
              showNotification(`Order successfully authorized with PayPal: ${orderId}`);
            }}
          />
        )}
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

      {/* Real-time HITL Push Approval Modal */}
      <HitlApprovalModal
        request={hitlRequest}
        isOpen={isHitlOpen}
        onApprove={(id) => {
          setIsHitlOpen(false);
          showNotification(`HITL Approved: Counter-offer accepted! Cleared via PayPal Vault.`);
        }}
        onDecline={(id) => {
          setIsHitlOpen(false);
          showNotification(`HITL Declined: Merchant counter-offer rejected. Zero funds authorized.`);
        }}
        onTimeout={(id) => {
          setIsHitlOpen(false);
          showNotification(`HITL Expired: 60s timer elapsed. Autonomous safety block enforced.`);
        }}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 bg-slate-100 dark:bg-[#080d19]/80 text-center text-xs text-slate-600 dark:text-slate-400 font-mono transition-colors">
        AegisPay Architecture • Autonomous Dual-Sided Agentic Commerce Platform • Build What&apos;s Next with PayPal 2026
      </footer>
    </div>
  );
}
