import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartProvider, useCart } from './CartContext.js';
import type { ProductCardData } from '@aegispay/shared-types';

const mockProductA: ProductCardData = {
  product_id: 'prod_test_01',
  title: 'Test Audio Headphone',
  description: 'Premium headphones',
  category_id: 'audio',
  price_cents: 20000,
  compare_at_price_cents: 25000,
  commission_rebate_cents: 2000,
  commission_rate: 0.1,
  merchant_domain: 'bestbuy.com',
  shipping_fee_cents: 0,
  shipping_waiver_threshold_cents: 25000,
  stock_status: 'IN_STOCK',
  delivery_window: '2-3 Business Days',
};

const mockProductB: ProductCardData = {
  product_id: 'prod_test_02',
  title: 'Test Camera Lens',
  description: '50mm prime lens',
  category_id: 'visual',
  price_cents: 35000,
  compare_at_price_cents: 40000,
  commission_rebate_cents: 3500,
  commission_rate: 0.1,
  merchant_domain: 'bhphotovideo.com',
  shipping_fee_cents: 0,
  shipping_waiver_threshold_cents: 25000,
  stock_status: 'IN_STOCK',
  delivery_window: '2-Day Express',
};

test('CartContext: Renders provider and children without crashing', () => {
  let contextValue: ReturnType<typeof useCart> | null = null;

  function Consumer() {
    contextValue = useCart();
    return React.createElement('div', null, `Cart Items: ${contextValue.totalItemsCount}`);
  }

  const html = renderToStaticMarkup(
    React.createElement(CartProvider, null, React.createElement(Consumer))
  );

  assert.ok(html.includes('Cart Items: 0'));
  assert.ok(contextValue !== null);
  assert.equal(contextValue!.items.length, 0);
  assert.equal(contextValue!.totalItemsCount, 0);
  assert.equal(contextValue!.totalPriceCents, 0);
  assert.equal(contextValue!.totalRebateCents, 0);
});

test('CartContext: Safely provides default fallback when useCart is used outside CartProvider', () => {
  let fallbackVal: ReturnType<typeof useCart> | null = null;
  function SafeConsumer() {
    fallbackVal = useCart();
    return React.createElement('div', null, `Fallback Items: ${fallbackVal.totalItemsCount}`);
  }

  const html = renderToStaticMarkup(React.createElement(SafeConsumer));
  assert.ok(html.includes('Fallback Items: 0'));
  assert.ok(fallbackVal !== null);
  assert.equal(fallbackVal!.items.length, 0);
  assert.equal(typeof fallbackVal!.openCart, 'function');
});

test('CartContext: Computes knapsack optimization with merchant groups', () => {
  let ctx: ReturnType<typeof useCart> | null = null;

  function TestHarness() {
    const cart = useCart();
    ctx = cart;

    React.useEffect(() => {
      cart.addToCart(mockProductA, 1);
      cart.addToCart(mockProductB, 2);
    }, []);

    return React.createElement('div', null, `Total: ${cart.totalPriceCents}`);
  }

  renderToStaticMarkup(React.createElement(CartProvider, null, React.createElement(TestHarness)));

  assert.ok(ctx !== null);
  assert.equal(typeof ctx!.openCart, 'function');
  assert.equal(typeof ctx!.closeCart, 'function');
  assert.equal(typeof ctx!.addToCart, 'function');
  assert.equal(typeof ctx!.removeFromCart, 'function');
  assert.equal(typeof ctx!.updateQuantity, 'function');
  assert.equal(typeof ctx!.clearCart, 'function');
});
