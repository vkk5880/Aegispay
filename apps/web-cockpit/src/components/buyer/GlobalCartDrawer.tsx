'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UnifiedCartDrawer } from './UnifiedCartDrawer';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { webLogger as logger } from '@/lib/logger';

export function GlobalCartDrawer() {
  const router = useRouter();
  const { isCartOpen, closeCart, optimizationData, removeFromCart, clearCart } = useCart();
  const { user, recordPurchaseSpend } = useAuth();

  const handleCheckout = async () => {
    if (!optimizationData || optimizationData.assigned_merchants.length === 0) return;

    const totalCents = optimizationData.net_buyer_expenditure_cents;
    const firstMerchant = optimizationData.assigned_merchants[0];
    const firstItem = firstMerchant?.items?.[0];
    const effectiveUserId = user?.email || (user as any)?.id || 'sb-buyer@personal.example.com';
    const orderId = `ord_pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.info('[GlobalCartDrawer:Checkout] Proceed to checkout', {
      orderId,
      effectiveUserId,
      netBuyerExpenditureCents: totalCents,
      merchantCount: optimizationData.assigned_merchants.length,
    });

    try {
      await fetch('/api/buyer/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
        },
        body: JSON.stringify({
          message: `Order checkout for ${firstItem?.title || 'cart items'}`,
          action: 'BUY',
          selected_product_ids: optimizationData.assigned_merchants.flatMap((m) =>
            m.items.map((i) => i.product_id)
          ),
          budget_cap_cents: totalCents + 5000,
          allowed_category_ids: user?.allowedCategories,
          allowed_merchants: user?.allowedMerchants,
        }),
      });
    } catch (err: any) {
      logger.warn('[GlobalCartDrawer:Checkout] Failed to dispatch checkout via buyer chat', {
        error: err?.message,
      });
    }

    closeCart();
    recordPurchaseSpend(totalCents);
    clearCart();

    if (typeof window !== 'undefined') {
      router.push(`/history?order_id=${encodeURIComponent(orderId)}`);
    }
  };

  return (
    <UnifiedCartDrawer
      isOpen={isCartOpen}
      onClose={closeCart}
      cart={optimizationData}
      onRemoveItem={removeFromCart}
      onProceedToCheckout={handleCheckout}
    />
  );
}
