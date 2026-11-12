import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from './[productId]/route.js';

test('GET /api/buyer/products/[productId]: Returns 200 and product data for valid catalog item', async () => {
  const req = new Request('http://localhost:3000/api/buyer/products/ch3_anc_headphone_01');
  const params = Promise.resolve({ productId: 'ch3_anc_headphone_01' });

  const res = await GET(req, { params });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.product_id, 'ch3_anc_headphone_01');
  assert.ok(data.title.includes('Sony WH-1000XM5'));
  assert.ok(data.price_cents > 0);
  assert.equal(data.merchant_domain, 'bestbuy.com');
});

test('GET /api/buyer/products/[productId]: Returns 404 for unknown product ID', async () => {
  const req = new Request('http://localhost:3000/api/buyer/products/unknown_xyz_999');
  const params = Promise.resolve({ productId: 'unknown_xyz_999' });

  const res = await GET(req, { params });
  assert.equal(res.status, 404);

  const data = await res.json();
  assert.equal(data.error, 'Product not found');
});

test('GET /api/buyer/products/[productId]: Returns 400 when product ID is missing', async () => {
  const req = new Request('http://localhost:3000/api/buyer/products/');
  const params = Promise.resolve({ productId: '' });

  const res = await GET(req, { params });
  assert.equal(res.status, 400);

  const data = await res.json();
  assert.equal(data.error, 'Missing product ID');
});
