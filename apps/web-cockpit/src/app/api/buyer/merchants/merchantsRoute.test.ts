import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { GET as getMerchants } from './route.js';
import { POST as postChat } from '../chat/route.js';

test('GET /api/buyer/merchants: Returns top merchants with fallback and search filtering', async () => {
  // Test 1: Fetch default list
  const reqDefault = new NextRequest('http://localhost:3000/api/buyer/merchants');
  const resDefault = await getMerchants(reqDefault);
  assert.equal(resDefault.status, 200);

  const dataDefault = await resDefault.json();
  assert.ok(Array.isArray(dataDefault.merchants));
  assert.ok(dataDefault.merchants.length > 0);
  assert.equal(typeof dataDefault.total, 'number');

  // Verify merchant structure
  const firstMerchant = dataDefault.merchants[0];
  assert.ok(firstMerchant.domain);
  assert.ok(firstMerchant.name);

  // Test 2: Search filtering for "audio"
  const reqSearch = new NextRequest('http://localhost:3000/api/buyer/merchants?query=audio');
  const resSearch = await getMerchants(reqSearch);
  assert.equal(resSearch.status, 200);

  const dataSearch = await resSearch.json();
  assert.ok(Array.isArray(dataSearch.merchants));
  const matched = dataSearch.merchants.some(
    (m: any) => m.name.toLowerCase().includes('audio') || m.domain.toLowerCase().includes('audio')
  );
  assert.ok(matched, 'Expected search for "audio" to return relevant merchant');
});

test('POST /api/buyer/chat: Blocks BUY action if category is not in allowed_category_ids', async () => {
  const req = new NextRequest('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'test_sec_cat_01',
      message: 'buy item',
      action: 'BUY',
      history: [],
      // Restrict to ONLY office-supplies, while sample buy products are electronics/audio
      allowed_category_ids: ['office-supplies'],
      allowed_merchants: ['*'],
      stream: false,
    }),
  });

  const res = await postChat(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'CHAT');
  assert.ok(data.markdown.includes('Purchase Blocked: Category Not Authorized'));
  assert.ok(data.thought_trace.some((t: string) => t.includes('ERR_CATEGORY_NOT_AUTHORIZED')));
});

test('POST /api/buyer/chat: Blocks BUY action if store is not in allowed_merchants whitelist', async () => {
  const req = new NextRequest('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'test_sec_merch_01',
      message: 'buy item',
      action: 'BUY',
      history: [],
      allowed_category_ids: ['*'],
      // Only permit an unrelated merchant
      allowed_merchants: ['nike.com'],
      stream: false,
    }),
  });

  const res = await postChat(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'CHAT');
  assert.ok(data.markdown.includes('Purchase Blocked: Store Not in Authorized Whitelist'));
  assert.ok(data.thought_trace.some((t: string) => t.includes('ERR_MERCHANT_NOT_AUTHORIZED')));
});

test('POST /api/buyer/chat: Allows BUY action when both category and merchant are whitelisted', async () => {
  const req = new NextRequest('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'test_sec_ok_01',
      message: 'buy item',
      action: 'BUY',
      history: [],
      allowed_category_ids: ['audio', 'workspace'],
      allowed_merchants: ['audio-gear-direct.com', 'nordic-workspaces.io'],
      stream: false,
    }),
  });

  const res = await postChat(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'BUY');
  assert.ok(data.cart);
  assert.ok(data.stock_reservation);
  assert.ok(data.markdown.includes('Pre-Purchase Verification'));
});
