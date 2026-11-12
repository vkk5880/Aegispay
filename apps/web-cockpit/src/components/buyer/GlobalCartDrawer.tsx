'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UnifiedCartDrawer, OrderConfirmationData } from './UnifiedCartDrawer';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { webLogger as logger } from '@/lib/logger';

export function GlobalCartDrawer() {
  const router = useRouter();
  const { isCartOpen, closeCart, optimizationData, removeFromCart, clearCart } = useCart();
  const { user, recordPurchaseSpend } = useAuth();
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<OrderConfirmationData | null>(null);

  const handleCheckout = async () => {
    if (!optimizationData || optimizationData.assigned_merchants.length === 0) return;

    setIsCheckingOut(true);
    const totalCents = optimizationData.net_buyer_expenditure_cents;
    const firstMerchant = optimizationData.assigned_merchants[0];
    const firstItem = firstMerchant?.items?.[0];
    const effectiveUserId = user?.email || (user as any)?.id || 'sb-buyer@personal.example.com';
    const clientOrderId = `ord_pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const allItems = optimizationData.assigned_merchants.flatMap((m) => m.items || []);
    const totalItemCount = allItems.reduce((acc, it) => acc + (it.quantity || 1), 0);

    logger.info('[GlobalCartDrawer:Checkout] Proceed to checkout', {
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
          selected_product_ids: allItems.map((i) => i.product_id).filter(Boolean),
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
        clearCart();
        setConfirmationData({
          orderId: finalOrderId,
          receiptNumber: finalReceiptNumber,
          trackingNumber: finalTrackingNumber,
          carrier: 'FedEx Priority',
          totalCents,
          itemCount: totalItemCount,
          isFailed: false,
        });
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
      logger.warn('[GlobalCartDrawer:Checkout] Failed to dispatch checkout via buyer chat', {
        error: err?.message,
      });
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
  };

  const handleClose = () => {
    setConfirmationData(null);
    closeCart();
  };

  const handleContinueShopping = () => {
    setConfirmationData(null);
    closeCart();
  };

  const handleViewOrders = () => {
    setConfirmationData(null);
    closeCart();
    router.push('/history');
  };

  return (
    <UnifiedCartDrawer
      isOpen={isCartOpen}
      onClose={handleClose}
      cart={optimizationData}
      onRemoveItem={removeFromCart}
      onProceedToCheckout={handleCheckout}
      isCheckingOut={isCheckingOut}
      confirmationData={confirmationData}
      onContinueShopping={handleContinueShopping}
      onViewOrders={handleViewOrders}
    />
  );
}
