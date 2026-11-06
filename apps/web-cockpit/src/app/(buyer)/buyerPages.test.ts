import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HistoryPage from './history/page.js';
import SearchPage from './search/page.js';
import SharePage from './share/page.js';
import WatchlistPage from './watchlist/page.js';

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

test('SearchPage renders Suspense boundary fallback when server rendered outside App Router context', () => {
  const pageHtml = renderToStaticMarkup(React.createElement(SearchPage));
  assert.ok(pageHtml.includes('Initializing AegisPay Commerce Search...'));
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
