import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';

import HistoryPage, { HistoryContent } from './history/page.js';
import SearchPage, { SearchContent } from './search/page.js';
import SharePage, { ShareContent } from './share/page.js';
import WatchlistPage, { WatchlistContent } from './watchlist/page.js';

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

test('HistoryPage renders audit ledger, orders tab, and cryptographic proofs', () => {
  const html = renderToStaticMarkup(React.createElement(HistoryPage));

  assert.ok(html.includes('Purchase History &amp; Audit Ledger') || html.includes('Purchase History & Audit Ledger'));
  assert.ok(html.includes('SHA-256 Chained Ledger'));
  assert.ok(html.includes('RFC 8785 Canonical JSON'));
  assert.ok(html.includes('Orders &amp; Escrow Holds') || html.includes('Orders & Escrow Holds'));
  assert.ok(html.includes('Cryptographic Proofs &amp; Receipts') || html.includes('Cryptographic Proofs & Receipts'));
  assert.ok(html.includes('Sony WH-1000XM5 Wireless Noise Canceling Headphones'));
  assert.ok(html.includes('PayPal ID:'));
  assert.ok(html.includes('Dispute Forensics'));
});

test('HistoryContent renders empty state when zero orders exist', () => {
  const html = renderToStaticMarkup(React.createElement(HistoryContent, { initialItems: [], initialReceipts: [] }));

  assert.ok(html.includes('No Orders or Escrow Holds Found'));
  assert.ok(html.includes('Discover Products to Purchase'));
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

test('WatchlistPage renders price-drop watchlist with auto-buy triggers and add modal', () => {
  const html = renderToStaticMarkup(React.createElement(WatchlistPage));

  assert.ok(html.includes('Price-Drop Watchlist'));
  assert.ok(html.includes('Autonomous Price-Drop Watchlist &amp; 72h Escrow Auto-Buy') || html.includes('Autonomous Price-Drop Watchlist & 72h Escrow Auto-Buy'));
  assert.ok(html.includes('Sony WH-1000XM5 Wireless Headphones (Midnight Silver)'));
  assert.ok(html.includes('Apple AirPods Pro 2 with USB-C Case'));
  assert.ok(html.includes('Target Price Drop Triggered!'));
  assert.ok(html.includes('Auto-Buy Now'));
  assert.ok(html.includes('Trigger Price Check'));
  assert.ok(html.includes('Add Item'));
});

test('WatchlistContent renders empty state when zero items are watched', () => {
  const html = renderToStaticMarkup(React.createElement(WatchlistContent, { initialItems: [] }));

  assert.ok(html.includes('Your Watchlist is Empty'));
  assert.ok(html.includes('Add First Item'));
  assert.ok(html.includes('Browse Catalog'));
});
