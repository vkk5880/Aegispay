import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';

import HistoryPage from './history/page.js';
import { HistoryContent } from './history/HistoryContent.js';
import SearchPage from './search/page.js';
import { SearchContent } from './search/SearchContent.js';
import SharePage from './share/page.js';
import { ShareContent } from './share/ShareContent.js';
import WatchlistPage from './watchlist/page.js';
import { WatchlistContent } from './watchlist/WatchlistContent.js';

const mockAppRouter = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

function withMockRouter(children: React.ReactNode) {
  return React.createElement(
    AppRouterContext.Provider,
    { value: mockAppRouter as any },
    children
  );
}

test('HistoryPage renders audit ledger headers and clean empty state when no orders exist', () => {
  const html = renderToStaticMarkup(React.createElement(HistoryPage));

  assert.ok(html.includes('Purchase History &amp; Audit Ledger') || html.includes('Purchase History & Audit Ledger'));
  assert.ok(html.includes('SHA-256 Chained Ledger'));
  assert.ok(html.includes('RFC 8785 Canonical JSON'));
  assert.ok(html.includes('Orders &amp; Escrow Holds') || html.includes('Orders & Escrow Holds'));
  assert.ok(html.includes('Cryptographic Proofs &amp; Receipts') || html.includes('Cryptographic Proofs & Receipts'));
  assert.ok(html.includes('No Orders or Escrow Holds Found'));
  assert.ok(html.includes('Discover Products to Purchase'));
});

test('HistoryContent renders live order card, PayPal ID, tracking, and dispute forensics when orders exist', () => {
  const liveOrder = {
    order_id: 'ord_pp_live_123',
    user_id: 'user_live@example.com',
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    price_cents: 34800,
    merchant_domain: 'bestbuy.com',
    cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    score: 9.4,
    tx_id: 'PAYID-LIVE12345678',
    reservation_id: 'vch_live_1234',
    escrow_status: 'HELD' as const,
    timestamp: '2026-11-07T10:00:00.000Z',
    receipt_number: 1042,
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    carrier: 'FedEx Priority',
    tracking_number: '789012345678',
    fulfillment_status: 'shipped' as const,
  };

  const html = renderToStaticMarkup(React.createElement(HistoryContent, { initialItems: [liveOrder] }));

  assert.ok(html.includes('Sony WH-1000XM5 Wireless Noise Canceling Headphones'));
  assert.ok(html.includes('PayPal ID:'));
  assert.ok(html.includes('PAYID-LIVE12345678'));
  assert.ok(html.includes('Dispute Forensics'));
  assert.ok(html.includes('FedEx Priority'));
});

test('SearchPage renders Suspense boundary fallback when server rendered outside App Router context', () => {
  const pageHtml = renderToStaticMarkup(React.createElement(SearchPage));
  assert.ok(pageHtml.includes('Initializing AegisPay Commerce Search...'));
});

test('SearchContent renders query results or empty search state properly inside App Router context', () => {
  // Populated search results
  const populatedHtml = renderToStaticMarkup(withMockRouter(React.createElement(SearchContent)));
  assert.ok(populatedHtml.includes('Autonomous Product Search &amp; Comparison') || populatedHtml.includes('Autonomous Product Search & Comparison'));
  assert.ok(populatedHtml.includes('Sony WH-1000XM5 Wireless Noise-Canceling Headphones'));
  assert.ok(populatedHtml.includes('1-Click Buy in Cockpit'));

  // Empty search results
  const emptyHtml = renderToStaticMarkup(withMockRouter(React.createElement(SearchContent, { initialResults: [] })));
  assert.ok(emptyHtml.includes('No Matching Offers Found'));
  assert.ok(emptyHtml.includes('Try another search term'));
});

test('SharePage renders referee comparison decision dossier with winner and runner-up', () => {
  const html = renderToStaticMarkup(React.createElement(SharePage));

  assert.ok(html.includes('AI Shopping Recommendation'));
  assert.ok(html.includes('Referee Battle Verdict'));
  assert.ok(html.includes('Referee Winner'));
  assert.ok(html.includes('Runner Up Contender'));
  assert.ok(html.includes('Sony WH-1000XM5 Wireless Noise-Canceling Headphones'));
  assert.ok(html.includes('Bose QuietComfort Ultra Wireless Headphones'));
  assert.ok(html.includes('1-Click Buy in AegisPay Cockpit'));
  assert.ok(html.includes('Share Decision Link'));
});

test('ShareContent renders empty state when comparison data is unavailable', () => {
  const html = renderToStaticMarkup(React.createElement(ShareContent, { initialWinner: null, initialRunnerUp: null }));

  assert.ok(html.includes('No Comparison Dossier Available'));
  assert.ok(html.includes('Search &amp; Compare Products') || html.includes('Search & Compare Products'));
});

test('WatchlistPage renders price-drop watchlist with live controls and add modal', () => {
  const html = renderToStaticMarkup(React.createElement(WatchlistPage));

  assert.ok(html.includes('Price-Drop Watchlist'));
  assert.ok(html.includes('Autonomous Price-Drop Watchlist &amp; 72h Escrow Auto-Buy') || html.includes('Autonomous Price-Drop Watchlist & 72h Escrow Auto-Buy') || html.includes('Price-Drop Watchlist &amp; Instant Deal Alerts') || html.includes('Price-Drop Watchlist & Instant Deal Alerts'));
  assert.ok(html.includes('Add Item'));
  assert.ok(html.includes('Trigger Price Check') || html.includes('Check Prices Now'));
  assert.ok(html.includes('Your Watchlist is Empty'));
  assert.ok(html.includes('Add First Item'));
  assert.ok(html.includes('Browse Catalog'));
});

test('WatchlistContent renders price-drop items with auto-buy triggers and potential savings', () => {
  const testItems = [
    {
      id: 'wch_live_1',
      user_id: 'usr_buyer_1',
      title: 'Sony WH-1000XM5 Wireless Headphones (Midnight Silver)',
      current_price_cents: 34800,
      target_price_cents: 32000,
      source: 'bestbuy.com',
      added_at: '2026-11-11T00:00:00.000Z',
      triggered: false,
    },
    {
      id: 'wch_live_2',
      user_id: 'usr_buyer_1',
      title: 'Apple AirPods Pro 2 with USB-C Case',
      current_price_cents: 18900,
      target_price_cents: 18900,
      source: 'target.com',
      added_at: '2026-11-11T00:00:00.000Z',
      triggered: true,
    },
  ];

  const html = renderToStaticMarkup(React.createElement(WatchlistContent, { initialItems: testItems }));

  assert.ok(html.includes('Price-Drop Watchlist'));
  assert.ok(html.includes('Sony WH-1000XM5 Wireless Headphones (Midnight Silver)'));
  assert.ok(html.includes('Apple AirPods Pro 2 with USB-C Case'));
  assert.ok(html.includes('Target Price Drop Triggered!'));
  assert.ok(html.includes('Auto-Buy Now') || html.includes('Buy at Target Price'));
  assert.ok(html.includes('Potential Savings'));
});

test('WatchlistContent renders empty state when zero items are watched', () => {
  const html = renderToStaticMarkup(React.createElement(WatchlistContent, { initialItems: [] }));

  assert.ok(html.includes('Your Watchlist is Empty'));
  assert.ok(html.includes('Add First Item'));
  assert.ok(html.includes('Browse Catalog'));
});
