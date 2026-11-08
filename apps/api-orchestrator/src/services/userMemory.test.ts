import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UniversalBuyerFacetsSchema,
  DomainFacetSchema,
  DynamicBuyerProfileSchema,
  ProductCardData,
} from '@aegispay/shared-types';
import {
  loadDynamicBuyerProfile,
  saveDynamicBuyerProfile,
  compactBuyerMemoryFromSession,
  applyDynamicUserRules,
  loadUserPreferences,
  saveUserPreference,
  applyUserRules,
  logPurchase,
  getPurchaseHistory,
  checkWatchlistItem,
} from './user-memory.js';

describe('Phase 1: Dynamic Multi-Domain AI Buyer Memory Engine', () => {
  it('validates DynamicBuyerProfileSchema contract and enforces non-negative spend invariants', () => {
    const rawProfile = {
      userId: 'usr_test_buyer_01',
      universal: {
        userId: 'usr_test_buyer_01',
        budget_elasticity: {
          target_price_sensory: 'value_optimized',
          max_spontaneous_spend_cents: 12000,
          requires_approval_above_cents: 30000,
        },
        preferred_brands: ['Sony', 'Keychron'],
        avoided_brands: ['ScamBrand'],
        preferred_fulfillment: 'express_shipping',
        merchant_minimum_trust_score: 80,
      },
      domain_facets: {
        computing: {
          category: 'computing',
          attributes: { switch_type: 'brown', wireless: true },
          confidence_score: 0.95,
          source_order_ids: ['ord_01'],
          last_updated: new Date().toISOString(),
        },
      },
      purchase_velocity: {
        total_orders_completed: 3,
        lifetime_spend_cents: 45000,
        dispute_count: 0,
      },
      updated_at: new Date().toISOString(),
    };

    const parsed = DynamicBuyerProfileSchema.parse(rawProfile);
    assert.equal(parsed.userId, 'usr_test_buyer_01');
    assert.equal(parsed.universal.budget_elasticity.max_spontaneous_spend_cents, 12000);
    assert.equal(parsed.purchase_velocity.lifetime_spend_cents, 45000);
  });

  it('compactBuyerMemoryFromSession extracts domain facets, bumps confidence and increments spend velocity', () => {
    const testUserId = `usr_compact_${Date.now()}`;
    const initialProfile = loadDynamicBuyerProfile(testUserId);
    assert.equal(initialProfile.purchase_velocity.total_orders_completed, 0);

    const updated = compactBuyerMemoryFromSession(
      testUserId,
      {
        order_id: 'ord_session_999',
        total_cents: 14999,
        items: [
          {
            title: 'Sony WH-1000XM5 Wireless Headphones',
            brand: 'Sony',
            category: 'audio',
            unit_price_cents: 14999,
            attributes: { noise_cancelling: true, form_factor: 'over-ear' },
          },
        ],
      },
      {
        category: 'audio',
        extracted_specs: { preferred_codec: 'LDAC' },
      }
    );

    assert.equal(updated.purchase_velocity.total_orders_completed, 1);
    assert.equal(updated.purchase_velocity.lifetime_spend_cents, 14999);
    assert.ok(updated.universal.preferred_brands.includes('Sony'));

    const audioFacet = updated.domain_facets['audio'];
    assert.ok(audioFacet, 'audio facet should be recorded');
    assert.equal(audioFacet.attributes['noise_cancelling'], true);
    assert.equal(audioFacet.attributes['preferred_codec'], 'LDAC');
    assert.ok(audioFacet.source_order_ids.includes('ord_session_999'));
    assert.ok(audioFacet.confidence_score >= 0.85);
  });

  it('applyDynamicUserRules filters avoided brands and merchants below minimum credibility score', () => {
    const testUserId = `usr_rules_${Date.now()}`;
    const profile = loadDynamicBuyerProfile(testUserId);
    profile.universal.avoided_brands = ['UntrustedCo'];
    profile.universal.merchant_minimum_trust_score = 75;

    const mockProducts: ProductCardData[] = [
      {
        product_id: 'prod_1',
        title: 'UntrustedCo Bad Headphones',
        description: 'Poor quality',
        category_id: 'audio',
        price_cents: 4999,
        compare_at_price_cents: 5999,
        commission_rebate_cents: 0,
        commission_rate: 0,
        rating: 2.0,
        review_count: 5,
        shipping_fee_cents: 0,
        free_shipping: true,
        merchant_domain: 'untrusted.com',
        merchant_credibility_score: 90,
        stock_status: 'IN_STOCK',
        delivery_window: '2-3 Business Days',
        image_url: 'https://example.com/p1.jpg',
        cleaned_image_url: 'https://example.com/p1.jpg',
      },
      {
        product_id: 'prod_2',
        title: 'Budget Audio Earbuds',
        description: 'Decent sound',
        category_id: 'audio',
        price_cents: 2999,
        compare_at_price_cents: 3999,
        commission_rebate_cents: 0,
        commission_rate: 0,
        rating: 3.5,
        review_count: 40,
        shipping_fee_cents: 0,
        free_shipping: true,
        merchant_domain: 'shady-reseller.com',
        merchant_credibility_score: 50, // Below 75 threshold
        stock_status: 'IN_STOCK',
        delivery_window: '2-3 Business Days',
        image_url: 'https://example.com/p2.jpg',
        cleaned_image_url: 'https://example.com/p2.jpg',
      },
      {
        product_id: 'prod_3',
        title: 'Sony Premium Headset',
        description: 'High fidelity audio',
        category_id: 'audio',
        price_cents: 19999,
        compare_at_price_cents: 24999,
        commission_rebate_cents: 0,
        commission_rate: 0,
        rating: 4.8,
        review_count: 500,
        shipping_fee_cents: 0,
        free_shipping: true,
        merchant_domain: 'sony.com',
        merchant_credibility_score: 98,
        stock_status: 'IN_STOCK',
        delivery_window: '2-3 Business Days',
        image_url: 'https://example.com/p3.jpg',
        cleaned_image_url: 'https://example.com/p3.jpg',
      },
    ];

    const filtered = applyDynamicUserRules(mockProducts, profile, 'audio');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].product_id, 'prod_3');
  });

  it('preserves legacy user preference memory and watchlist alert functions with full backwards compatibility', () => {
    const prefs = loadUserPreferences('legacy_usr_01');
    assert.ok(Array.isArray(prefs.preferred_brands));

    saveUserPreference('legacy_usr_01', 'max_price_cents', 15000);
    const updatedPrefs = loadUserPreferences('legacy_usr_01');
    assert.equal(updatedPrefs.max_price_cents, 15000);

    const purchase = logPurchase({
      order_id: 'ord_leg_01',
      user_id: 'legacy_usr_01',
      title: 'Anker Power Bank',
      price_cents: 4999,
      merchant_domain: 'anker.com',
    });
    assert.equal(purchase.order_id, 'ord_leg_01');

    const history = getPurchaseHistory('legacy_usr_01');
    assert.ok(history.length >= 1);
    assert.equal(history[0].order_id, 'ord_leg_01');

    const watchlistEval = checkWatchlistItem(
      {
        id: 'w1',
        user_id: 'legacy_usr_01',
        title: 'Sony XM5',
        current_price_cents: 39999,
        target_price_cents: 34999,
        source: 'sony.com',
        link: '',
        query: 'Sony XM5',
        added_at: new Date().toISOString(),
        triggered: false,
      },
      32999
    );
    assert.ok(watchlistEval);
    assert.equal(watchlistEval.triggered, true);
    assert.equal(watchlistEval.saving_cents, 7000);
  });
});
