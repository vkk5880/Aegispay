'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { ProductCardData } from '@aegispay/shared-types';
import type {
  KnapsackOptimizationData,
  KnapsackMerchantGroup,
  KnapsackItem,
} from '@/components/buyer/KnapsackSplitVisualizer';
import { getProductImageUrl } from '@/lib/productImageHelper';

export interface CartItem {
  product: ProductCardData;
  quantity: number;
  selectedVariant?: string;
  addedAt: number;
}

export interface CartContextType {
  items: CartItem[];
  totalItemsCount: number;
  totalPriceCents: number;
  totalRebateCents: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (product: ProductCardData, quantity?: number, selectedVariant?: string) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  optimizationData: KnapsackOptimizationData;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'aegispay_cart_basket';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {}
    setIsInitialized(true);
  }, []);

  // Save to localStorage when items update after initial hydration
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, isInitialized]);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const addToCart = (product: ProductCardData, quantity = 1, selectedVariant?: string) => {
    if (!product || !product.product_id) return;
    setItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.product.product_id === product.product_id);
      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + quantity,
          selectedVariant: selectedVariant || next[existingIdx].selectedVariant,
        };
        return next;
      }
      return [...prev, { product, quantity, selectedVariant, addedAt: Date.now() }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((it) => it.product.product_id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((it) => (it.product.product_id === productId ? { ...it, quantity } : it))
    );
  };

  const clearCart = () => setItems([]);

  const totalItemsCount = useMemo(
    () => items.reduce((acc, it) => acc + (it.quantity || 1), 0),
    [items]
  );

  const totalPriceCents = useMemo(
    () => items.reduce((acc, it) => acc + (it.product.price_cents || 0) * (it.quantity || 1), 0),
    [items]
  );

  const totalRebateCents = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc + (it.product.commission_rebate_cents || 0) * (it.quantity || 1),
        0
      ),
    [items]
  );

  // Group items into multi-merchant knapsack structure
  const optimizationData: KnapsackOptimizationData = useMemo(() => {
    if (items.length === 0) {
      return {
        assigned_merchants: [],
        gross_subtotal_cents: 0,
        total_commission_rebate_cents: 0,
        total_shipping_cents: 0,
        total_shipping_saved_cents: 0,
        net_buyer_expenditure_cents: 0,
        savings_percentage: 0,
        is_within_budget: true,
        budget_cap_cents: 50000,
      };
    }

    const merchantGroups: Record<string, CartItem[]> = {};
    for (const it of items) {
      const domain = it.product.merchant_domain || 'bestbuy.com';
      if (!merchantGroups[domain]) merchantGroups[domain] = [];
      merchantGroups[domain].push(it);
    }

    let totalShippingCents = 0;
    let totalShippingSavedCents = 0;

    const assignedMerchants: KnapsackMerchantGroup[] = Object.entries(merchantGroups).map(
      ([domain, groupItems]) => {
        const subtotal = groupItems.reduce(
          (acc, it) => acc + (it.product.price_cents || 0) * (it.quantity || 1),
          0
        );
        const waiver = groupItems[0]?.product.shipping_waiver_threshold_cents || 25000;
        const waived = subtotal >= waiver;
        const shippingFee = waived ? 0 : 999;
        const shippingSaved = waived ? 999 : 0;

        totalShippingCents += shippingFee;
        totalShippingSavedCents += shippingSaved;

        const rebates = groupItems.reduce(
          (acc, it) =>
            acc + (it.product.commission_rebate_cents || 0) * (it.quantity || 1),
          0
        );

        const knapsackItems: KnapsackItem[] = groupItems.map((it) => ({
          product_id: it.product.product_id,
          title: it.selectedVariant
            ? `${it.product.title} (${it.selectedVariant})`
            : it.product.title,
          quantity: it.quantity,
          unit_price_cents: it.product.price_cents,
          unit_compare_price_cents: it.product.compare_at_price_cents || it.product.price_cents,
          commission_rate: it.product.commission_rate || 0.1,
          cleaned_url: getProductImageUrl(it.product),
        }));

        return {
          merchant_domain: domain,
          delivery_window: groupItems[0]?.product.delivery_window || '2-3 Business Days',
          estimated_arrival: 'Est. Delivery in 2-3 business days',
          subtotal_cents: subtotal,
          commission_rebate_cents: rebates,
          shipping_fee_cents: shippingFee,
          shipping_waived: waived,
          waiver_threshold_cents: waiver,
          net_merchant_cents: subtotal + shippingFee - rebates,
          items: knapsackItems,
        };
      }
    );

    const grossSubtotal = totalPriceCents;
    const netExpenditure = grossSubtotal + totalShippingCents - totalRebateCents;
    const compareTotal = items.reduce(
      (acc, it) =>
        acc +
        (it.product.compare_at_price_cents && it.product.compare_at_price_cents > it.product.price_cents
          ? it.product.compare_at_price_cents * (it.quantity || 1)
          : (it.product.price_cents || 0) * (it.quantity || 1)),
      0
    );
    const totalSavings = (compareTotal - grossSubtotal) + totalRebateCents + totalShippingSavedCents;
    const savingsPct = compareTotal > 0 ? Math.round((totalSavings / compareTotal) * 100) : 10;

    return {
      assigned_merchants: assignedMerchants,
      gross_subtotal_cents: grossSubtotal,
      total_commission_rebate_cents: totalRebateCents,
      total_shipping_cents: totalShippingCents,
      total_shipping_saved_cents: totalShippingSavedCents,
      net_buyer_expenditure_cents: netExpenditure,
      savings_percentage: savingsPct,
      is_within_budget: true,
      budget_cap_cents: 50000,
    };
  }, [items, totalPriceCents, totalRebateCents]);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItemsCount,
        totalPriceCents,
        totalRebateCents,
        isCartOpen,
        openCart,
        closeCart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        optimizationData,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

const defaultCartContext: CartContextType = {
  items: [],
  totalItemsCount: 0,
  totalPriceCents: 0,
  totalRebateCents: 0,
  isCartOpen: false,
  openCart: () => {},
  closeCart: () => {},
  addToCart: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  optimizationData: {
    assigned_merchants: [],
    gross_subtotal_cents: 0,
    total_commission_rebate_cents: 0,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 0,
    net_buyer_expenditure_cents: 0,
    savings_percentage: 0,
    is_within_budget: true,
    budget_cap_cents: 50000,
  },
};

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  return ctx || defaultCartContext;
}
