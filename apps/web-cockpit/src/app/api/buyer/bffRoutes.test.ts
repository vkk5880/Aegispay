import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as postClarify } from './clarify/route.js';
import { POST as postEnrich } from './enrich/route.js';
import { GET as getSocialProof } from './social-proof/route.js';
import { GET as getCommunitySentiment } from './community-sentiment/route.js';
import { GET as getModels } from './models/route.js';
import { POST as postSyntheticBid } from './synthetic-bid/route.js';
import { POST as postKnapsack } from './knapsack/route.js';

test('BFF Route: POST /api/buyer/clarify returns valid clarification schema', async () => {
  const req = new Request('http://localhost:3000/api/buyer/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'headphones' }),
  });
  const res = await postClarify(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.equal(typeof data.needs_clarification, 'boolean');
  assert.ok(Array.isArray(data.questions));
});

test('BFF Route: POST /api/buyer/enrich returns refined query', async () => {
  const req = new Request('http://localhost:3000/api/buyer/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'headphones',
      answers: { 0: 'noise canceling', 1: 'under $300' },
    }),
  });
  const res = await postEnrich(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.enriched_query.includes('headphones'));
  assert.ok(data.enriched_query.includes('noise canceling'));
});

test('BFF Route: GET /api/buyer/social-proof returns metrics', async () => {
  const req = new Request('http://localhost:3000/api/buyer/social-proof?title=Sony%20WH-1000XM5');
  const res = await getSocialProof(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.social_proof);
  assert.ok(data.social_proof.sentiment_score >= 0);
});

test('BFF Route: GET /api/buyer/community-sentiment returns sentiment breakdown', async () => {
  const req = new Request('http://localhost:3000/api/buyer/community-sentiment?title=Sony%20WH-1000XM5');
  const res = await getCommunitySentiment(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.community_sentiment);
});

test('BFF Route: GET /api/buyer/models returns dynamic model catalog', async () => {
  const res = await getModels();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(Array.isArray(data.available_models));
  assert.ok(data.available_models.length >= 3);
});

test('BFF Route: POST /api/buyer/synthetic-bid creates valid voucher structure', async () => {
  const req = new Request('http://localhost:3000/api/buyer/synthetic-bid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mandate_id: 'vch_test_123',
      buyer_bid_cents: 45000,
      retail_offer_cents: 49000,
    }),
  });
  const res = await postSyntheticBid(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.bid);
  assert.equal(data.bid.buyer_bid_cents, 45000);
});

test('BFF Route: POST /api/buyer/knapsack computes cart split', async () => {
  const req = new Request('http://localhost:3000/api/buyer/knapsack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ product_id: 'p1', price_cents: 20000, quantity: 1 }],
      budget_cap_cents: 50000,
    }),
  });
  const res = await postKnapsack(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.cart);
  assert.equal(data.cart.gross_subtotal_cents, 20000);
});
