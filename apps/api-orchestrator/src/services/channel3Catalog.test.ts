import test from 'node:test';
import assert from 'node:assert/strict';
import { Channel3Client, Channel3ProductDetail } from './channel3.client.js';
import { CartSolver } from './cart-solver.js';

test('Channel3Client: provides promo code PAYPAL-HACKATHON-2026 in default headers', () => {
  const client = new Channel3Client();
  const headers = client.getHeaders();
  assert.equal(headers['x-promo-code'], 'PAYPAL-HACKATHON-2026');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(client.getPromoCode(), 'PAYPAL-HACKATHON-2026');
  assert.equal(client.getBaseUrl(), 'https://api.channel3.ai');
});

test('Channel3Client: supports custom promo code and authorization header when apiKey is supplied', () => {
  const customClient = new Channel3Client('custom_live_key_999', 'https://mock.channel3.ai', 'CUSTOM-PROMO-2026');
  const headers = customClient.getHeaders();
  assert.equal(headers['x-promo-code'], 'CUSTOM-PROMO-2026');
  assert.equal(headers['Authorization'], 'Bearer custom_live_key_999');
  assert.equal(headers['x-api-key'], 'custom_live_key_999');
  assert.equal(customClient.getBaseUrl(), 'https://mock.channel3.ai');
});

test('Channel3Client search: executes multi-modal search filters with fallback resilience', async () => {
  const client = new Channel3Client();

  // Test multi-modal query: text, image_url, category_ids, hex_color
  const res = await client.search({
    query: 'Headphones',
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
    category_ids: ['xoN'],
    hex_color: '#C0C0C0',
    limit: 10,
    offset: 0,
  });

  assert.ok(res.products.length > 0);
  assert.ok(res.total >= res.products.length);

  const product = res.products[0];
  assert.ok(product.product_id);
  assert.ok(product.title);
  assert.ok(product.offers.length > 0);

  // Verify pristine studio reference images (cleaned_url, 1024px white background)
  assert.ok(product.images.length > 0);
  const primaryImage = product.images[0];
  assert.ok(primaryImage.url);
  assert.ok(primaryImage.cleaned_url);
  assert.ok(primaryImage.cleaned_url.includes('1024'));
  assert.ok(primaryImage.cleaned_url.includes('bg=white'));
});

test('Channel3Client search: live fetch sends promo code and multi-modal payload', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = '';
  let interceptedHeaders: any = {};
  let interceptedBody: any = {};

  globalThis.fetch = (async (url: any, init?: any) => {
    interceptedUrl = String(url);
    interceptedHeaders = init?.headers;
    interceptedBody = JSON.parse(init?.body || '{}');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        total: 1,
        products: [
          {
            product_id: 'live_prod_100',
            title: 'Live Discovered Noise Cancelling Headphones',
            description: 'Live studio reference item',
            category_id: 'xoN',
            offers: [
              {
                id: 'live_off_1',
                product_id: 'live_prod_100',
                domain: 'live-merchant.com',
                price: 29900,
                compare_at_price: 34900,
                max_commission_rate: 0.15,
                stock_status: 'IN_STOCK',
              },
            ],
            images: [
              {
                url: 'https://cdn.channel3.ai/raw/headphones.jpg',
                cleaned_url: 'https://cdn.channel3.ai/cleaned/headphones-1024-white.jpg',
              },
            ],
          },
        ],
      }),
    } as any;
  }) as any;

  try {
    const liveClient = new Channel3Client('live_key_abc123');
    const result = await liveClient.search({
      query: 'noise cancelling headphones',
      image_url: 'https://inspiration.photos/clean_setup.png',
      category_ids: ['xoN'],
      hex_color: '#333333',
    });

    assert.equal(interceptedUrl, 'https://api.channel3.ai/v1/search');
    assert.equal(interceptedHeaders['x-promo-code'], 'PAYPAL-HACKATHON-2026');
    assert.equal(interceptedHeaders['Authorization'], 'Bearer live_key_abc123');
    assert.equal(interceptedBody.query, 'noise cancelling headphones');
    assert.equal(interceptedBody.image_url, 'https://inspiration.photos/clean_setup.png');
    assert.deepEqual(interceptedBody.category_ids, ['xoN']);
    assert.equal(interceptedBody.hex_color, '#333333');

    assert.equal(result.total, 1);
    assert.equal(result.products[0].product_id, 'live_prod_100');
    assert.equal(
      result.products[0].images[0].cleaned_url,
      'https://cdn.channel3.ai/cleaned/headphones-1024-white.jpg'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Channel3Client lookup: fetches products by ID and preserves pristine studio cleaned_url', async () => {
  const client = new Channel3Client();
  const products = await client.lookup(['ch3_prod_9921', 'ch3_prod_9922']);

  assert.equal(products.length, 2);
  const p1 = products.find(p => p.product_id === 'ch3_prod_9921');
  const p2 = products.find(p => p.product_id === 'ch3_prod_9922');

  assert.ok(p1);
  assert.ok(p2);
  assert.ok(p1.images[0].cleaned_url.includes('bg=white'));
  assert.ok(p2.images[0].cleaned_url.includes('bg=white'));
});

test('Channel3Client verifyAndHoldStock: 2PC pre-flight check succeeds when all items in stock', async () => {
  const client = new Channel3Client();
  const result = await client.verifyAndHoldStock([
    { product_id: 'ch3_prod_9921', quantity: 1, merchant_domain: 'techmerchant.com' },
    { product_id: 'ch3_prod_9922', quantity: 2, merchant_domain: 'powerhub.net' },
  ]);

  assert.equal(result.success, true);
  assert.equal(result.all_held, true);
  assert.equal(result.failed_items.length, 0);
  assert.equal(result.verified_items.length, 2);
  assert.ok(result.reservation_id.startsWith('res_2pc_'));

  const item1 = result.verified_items.find(i => i.product_id === 'ch3_prod_9921');
  assert.ok(item1);
  assert.equal(item1.status, 'RESERVED_2PC');
  assert.equal(item1.merchant_domain, 'techmerchant.com');
  assert.equal(item1.available_quantity, 100);
});

test('Channel3Client verifyAndHoldStock: triggers automatic Knapsack re-optimization when item is out of stock', async () => {
  const client = new Channel3Client();

  const customCatalog: Channel3ProductDetail[] = [
    {
      product_id: 'item_instock',
      title: 'In Stock Smart Hub',
      description: 'Connected hub',
      category_id: 'xoN',
      offers: [
        {
          id: 'off_avail',
          product_id: 'item_instock',
          domain: 'smartgear.com',
          price: 15000,
          compare_at_price: 18000,
          max_commission_rate: 0.10,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [
        {
          url: 'https://img.test/hub.jpg',
          cleaned_url: 'https://img.test/hub-clean.jpg',
        },
      ],
    },
    {
      product_id: 'item_out_of_stock',
      title: 'Out of Stock Accessory',
      description: 'Rare accessory',
      category_id: 'xoN',
      offers: [
        {
          id: 'off_soldout',
          product_id: 'item_out_of_stock',
          domain: 'smartgear.com',
          price: 4500,
          compare_at_price: 5000,
          max_commission_rate: 0.08,
          stock_status: 'OUT_OF_STOCK',
        },
      ],
      images: [
        {
          url: 'https://img.test/accessory.jpg',
          cleaned_url: 'https://img.test/accessory-clean.jpg',
        },
      ],
    },
  ];

  const result = await client.verifyAndHoldStock(
    [
      { product_id: 'item_instock', quantity: 1 },
      { product_id: 'item_out_of_stock', quantity: 1 },
    ],
    { catalog: customCatalog, zipCode: '94103' }
  );

  assert.equal(result.success, false);
  assert.equal(result.all_held, false);
  assert.deepEqual(result.failed_items, ['item_out_of_stock']);

  // Verify fallback reoptimization was triggered automatically
  assert.ok(result.fallback_reoptimization);
  const reopt = result.fallback_reoptimization;
  assert.equal(reopt.assigned_merchants.length, 1);
  assert.equal(reopt.assigned_merchants[0].merchant_domain, 'smartgear.com');
  assert.equal(reopt.assigned_merchants[0].items.length, 1);
  assert.equal(reopt.assigned_merchants[0].items[0].product_id, 'item_instock');
  assert.equal(reopt.assigned_merchants[0].items[0].cleaned_url, 'https://img.test/hub-clean.jpg');
});

test('Knapsack Cart Solver: seamlessly ingests Channel3 catalog and generates decoupled PayPal purchase units', () => {
  const solver = new CartSolver({ alpha: 0.75 });
  const catalog: Channel3ProductDetail[] = [
    {
      product_id: 'ch3_desk',
      title: 'Solid Walnut Standing Desk',
      description: 'Ergonomic solid wood desk',
      category_id: 'xoN',
      offers: [
        {
          id: 'off_desk_1',
          product_id: 'ch3_desk',
          domain: 'nordicworkspaces.com',
          price: 49900, // $499.00
          compare_at_price: 59900,
          max_commission_rate: 0.12, // 12% * 0.75 = $44.91 platform rebate
          shipping_fee_cents: 2500,
          shipping_waiver_threshold_cents: 40000, // shipping waived
          merchant_anomaly_score: 0.02,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [
        {
          url: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=1024',
          cleaned_url: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=1024&bg=white',
        },
      ],
    },
  ];

  const result = solver.solve(catalog, [{ product_id: 'ch3_desk', quantity: 1 }], {
    zipCode: '78701',
  });

  assert.equal(result.assigned_merchants.length, 1);
  const merchantGroup = result.assigned_merchants[0];
  assert.equal(merchantGroup.merchant_domain, 'nordicworkspaces.com');
  assert.equal(merchantGroup.shipping_waived, true);
  assert.equal(merchantGroup.shipping_fee_cents, 0);

  // Cleaned studio image preserved for dispute vision forensics
  assert.equal(
    merchantGroup.items[0].cleaned_url,
    'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=1024&bg=white'
  );

  // Decoupled settlement: full retail authorized on PayPal unit
  const pu = result.paypal_purchase_units[0];
  assert.ok(pu);
  assert.equal(pu.reference_id, 'PU_nordicworkspaces_com_1');
  assert.ok(pu.platform_subsidy_credit);
  assert.equal(pu.platform_subsidy_credit.settlement_decoupled, true);
  assert.equal(pu.platform_subsidy_credit.commission_rebate_cents, merchantGroup.commission_rebate_cents);
});
