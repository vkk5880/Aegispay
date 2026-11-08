import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../index.js';
import { generatePaymentReceipt } from '../middleware/http402-interceptor.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

test('Procurement API: POST /api/buyer/vault/setup creates ephemeral setup session', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/setup',
    payload: {
      customer_id: 'cust_procure_001',
      mandate_id: 'mandate_procure_001',
      return_url: 'https://aegispay.dev/checkout/return',
      cancel_url: 'https://aegispay.dev/checkout/cancel',
    },
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  const session = json.session || json;
  assert.ok(session.setup_token_id);
  assert.equal(session.customer_id, 'cust_procure_001');
  assert.equal(session.status, 'CREATED');
  assert.ok(session.approve_url);
});

test('Procurement API: POST /api/buyer/vault/confirm converts setup token to durable payment token', async () => {
  const app = await buildApp();

  const setupRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/setup',
    payload: {
      customer_id: 'cust_procure_002',
      mandate_id: 'mandate_procure_002',
    },
  });
  const setupJson = setupRes.json();
  const setupTokenId = setupJson.session ? setupJson.session.setup_token_id : setupJson.setup_token_id;

  const confirmRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/confirm',
    payload: {
      setup_token_id: setupTokenId,
      customer_id: 'cust_procure_002',
      mandate_id: 'mandate_procure_002',
    },
  });

  assert.equal(confirmRes.statusCode, 200);
  const confirmJson = confirmRes.json();
  const vault = confirmJson.vault || confirmJson;
  assert.ok(vault.paypal_payment_token_id);
  assert.equal(vault.status, 'VAULTED');
});

test('Procurement API: POST /api/buyer/authorize enforces schema and creates authorization hold', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_auth_01', 7500, 'USD');

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      mandate_id: 'mandate_procure_auth_01',
      purchase_units: [
        {
          reference_id: 'pu_test_1',
          description: 'Synthetic Order Item A',
          amount: {
            currency_code: 'USD',
            value: '75.00',
            breakdown: {
              item_total: { currency_code: 'USD', value: '75.00' },
            },
          },
          items: [
            {
              name: 'Anker Power Bank',
              quantity: '1',
              unit_amount: { currency_code: 'USD', value: '75.00' },
            },
          ],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.ok(json.order_id);
  assert.ok(json.authorization_id);
  assert.ok(json.status === 'CREATED' || json.status === 'AUTHORIZED');
});

test('Procurement API: Rejects malformed authorization request with 400 INVALID_REQUEST', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_auth_err', 5000, 'USD');

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      mandate_id: '', // Empty mandate ID violates schema
      purchase_units: [],
    },
  });

  assert.equal(response.statusCode, 400);
  const json = response.json();
  assert.equal(json.error, 'INVALID_REQUEST');
});

test('Procurement API: POST /api/buyer/capture captures approved order and triggers rollback on decline', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_cap_01', 5000, 'USD');

  // Success case
  const responseSuccess = await app.inject({
    method: 'POST',
    url: '/api/buyer/capture',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      order_id: 'MOCK_ORDER_CAP_SUCCESS',
      mandate_id: 'mandate_procure_cap_01',
      amount_cents: 5000,
      merchant_domain: 'sound-gear.com',
    },
  });

  assert.equal(responseSuccess.statusCode, 200);
  const jsonSuccess = responseSuccess.json();
  assert.equal(jsonSuccess.status, 'COMPLETED');
  assert.equal(jsonSuccess.order_id, 'MOCK_ORDER_CAP_SUCCESS');
  assert.ok(jsonSuccess.capture);
  assert.ok(jsonSuccess.order);

  // Capture denial case (INSTRUMENT_DECLINED triggering compensating rollback)
  const responseDecline = await app.inject({
    method: 'POST',
    url: '/api/buyer/capture',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      order_id: 'MOCK_ORDER_DECLINE',
      mandate_id: 'mandate_procure_decline_01',
      amount_cents: 5000,
      merchant_domain: 'sound-gear.com',
    },
  });

  assert.equal(responseDecline.statusCode, 500);
  const jsonDecline = responseDecline.json();
  assert.equal(jsonDecline.error, 'INSTRUMENT_DECLINED');
  assert.ok(jsonDecline.compensating_rollback);
  assert.equal(jsonDecline.restored_cents, 5000);
});

test('Intent Voucher API: POST and GET intent vouchers', async () => {
  const app = await buildApp();

  // Test broadcast overage handling
  const broadcastRes = await app.inject({
    method: 'POST',
    url: '/api/intent-vouchers/broadcast',
    payload: {
      mandate_id: 'mandate_voucher_01',
      channel3_product_id: 'ch3_prod_audio',
      merchant_domain: 'sound-gear.com',
      retail_offer_cents: 29900,
      buyer_budget_cap_cents: 25000,
      buyer_bid_cents: 24000,
    },
  });
  assert.equal(broadcastRes.statusCode, 200);
  const broadcastJson = broadcastRes.json();
  assert.equal(broadcastJson.eligible_for_synthetic_intent, false);

  // Test schema rejection
  const invalidBroadcastRes = await app.inject({
    method: 'POST',
    url: '/api/intent-vouchers/broadcast',
    payload: {
      mandate_id: '',
    },
  });
  assert.equal(invalidBroadcastRes.statusCode, 400);

  // Test GET voucher by id
  const getVoucherRes = await app.inject({
    method: 'GET',
    url: '/api/intent-vouchers/vch_sample_123',
  });
  assert.equal(getVoucherRes.statusCode, 200);
  const getVoucherJson = getVoucherRes.json();
  assert.equal(getVoucherJson.voucher_id, 'vch_sample_123');
  assert.equal(getVoucherJson.status, 'ACTIVE_PRICE_LOCK');
});

test('Procurement API: POST /api/buyer/capture enforces 3D Secure liability shift branches', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_3ds_liability_01', 5000, 'USD');

  // Branch A: Liability shift denied (liability_shift === 'NO' via authentication_result)
  const origGetOrder = defaultPayPalClient.getOrder;
  (defaultPayPalClient as any).getOrder = async (id: string) => {
    return {
      id,
      status: 'COMPLETED',
      intent: 'CAPTURE',
      gross_amount: { currency_code: 'USD', value: '50.00' },
      server_readback_verified: true,
      verification_timestamp: new Date().toISOString(),
      payment_source: {
        card: {
          authentication_result: {
            liability_shift: 'NO',
          },
        },
      },
    };
  };

  try {
    const resNo = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-payment-receipt': validReceipt,
      },
      payload: {
        order_id: 'ORDER_3DS_NO_SHIFT',
        mandate_id: 'mandate_3ds_shift_01',
        amount_cents: 5000,
        merchant_domain: 'sound-gear.com',
      },
    });

    assert.equal(resNo.statusCode, 500);
    const jsonNo = resNo.json();
    assert.equal(jsonNo.error, 'CAPTURE_FAILED');
    assert.ok(jsonNo.message.includes('LIABILITY_SHIFT_NO'));
    assert.equal(jsonNo.compensating_rollback, true);
    assert.equal(jsonNo.restored_cents, 5000);
  } finally {
    defaultPayPalClient.getOrder = origGetOrder;
  }

  // Branch B: Liability shift denied via attributes.verification['3d_secure']
  (defaultPayPalClient as any).getOrder = async (id: string) => {
    return {
      id,
      status: 'COMPLETED',
      intent: 'CAPTURE',
      gross_amount: { currency_code: 'USD', value: '50.00' },
      server_readback_verified: true,
      verification_timestamp: new Date().toISOString(),
      attributes: {
        verification: {
          '3d_secure': {
            liability_shift: 'NO',
          },
        },
      },
    };
  };

  try {
    const resNoAttr = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-payment-receipt': validReceipt,
      },
      payload: {
        order_id: 'ORDER_3DS_NO_ATTR_SHIFT',
        mandate_id: 'mandate_3ds_shift_02',
        amount_cents: 5000,
        merchant_domain: 'sound-gear.com',
      },
    });

    assert.equal(resNoAttr.statusCode, 500);
    const jsonNoAttr = resNoAttr.json();
    assert.equal(jsonNoAttr.error, 'CAPTURE_FAILED');
    assert.ok(jsonNoAttr.message.includes('LIABILITY_SHIFT_NO'));
    assert.equal(jsonNoAttr.compensating_rollback, true);
    assert.equal(jsonNoAttr.restored_cents, 5000);
  } finally {
    defaultPayPalClient.getOrder = origGetOrder;
  }

  // Branch C: Liability shift granted (liability_shift === 'POSSIBLE')
  (defaultPayPalClient as any).getOrder = async (id: string) => {
    return {
      id,
      status: 'COMPLETED',
      intent: 'CAPTURE',
      gross_amount: { currency_code: 'USD', value: '50.00' },
      server_readback_verified: true,
      verification_timestamp: new Date().toISOString(),
      payment_source: {
        card: {
          authentication_result: {
            liability_shift: 'POSSIBLE',
          },
        },
      },
    };
  };

  try {
    const resPossible = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-payment-receipt': validReceipt,
      },
      payload: {
        order_id: 'ORDER_3DS_POSSIBLE_SHIFT',
        mandate_id: 'mandate_3ds_shift_03',
        amount_cents: 5000,
        merchant_domain: 'sound-gear.com',
      },
    });

    assert.equal(resPossible.statusCode, 200);
    const jsonPossible = resPossible.json();
    assert.equal(jsonPossible.status, 'COMPLETED');
    assert.equal(jsonPossible.order_id, 'ORDER_3DS_POSSIBLE_SHIFT');
    assert.ok(jsonPossible.capture);
  } finally {
    defaultPayPalClient.getOrder = origGetOrder;
  }
});

test('Dispute Forensics API: GET /api/disputes/:id/hateoas returns valid action links across all stages', async () => {
  const app = await buildApp();
  const stages = ['INQUIRY', 'CLAIM', 'CHARGEBACK', 'PRE_ARBITRATION', 'ARBITRATION', 'RESOLVED'] as const;

  for (const stage of stages) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/disputes/PP-D-HATEOAS-TEST/hateoas?stage=${stage}&amount_cents=12500`,
    });

    assert.equal(response.statusCode, 200);
    const json = response.json();
    assert.equal(json.disputeId, 'PP-D-HATEOAS-TEST');
    assert.equal(json.stage, stage);
    assert.equal(json.disputeAmountCents, 12500);
    assert.ok(Array.isArray(json.allowedActions));
    assert.ok(Array.isArray(json.links));
    assert.ok(json.links.length > 0);

    for (const link of json.links) {
      assert.ok(link.rel, `Link in stage ${stage} must have a valid rel`);
      assert.ok(link.href.startsWith('/api/disputes/'), `Link href must target /api/disputes/`);
      assert.ok(['GET', 'POST', 'PUT'].includes(link.method), `Link method must be standard HTTP`);
      assert.ok(link.title, `Link title must be descriptive`);
      assert.ok(link.description, `Link description must be present`);
    }

    if (stage === 'INQUIRY') {
      const rels = json.links.map((l: any) => l.rel);
      assert.ok(rels.includes('send-message'));
      assert.ok(rels.includes('make-offer'));
      assert.ok(rels.includes('provide-evidence'));
      assert.ok(rels.includes('escalate'));
    } else if (stage === 'CLAIM') {
      const rels = json.links.map((l: any) => l.rel);
      assert.ok(rels.includes('accept-claim'));
      assert.ok(rels.includes('make-offer'));
      assert.ok(rels.includes('provide-evidence'));
      assert.ok(rels.includes('appeal'));
    } else if (stage === 'CHARGEBACK') {
      const rels = json.links.map((l: any) => l.rel);
      assert.ok(rels.includes('provide-evidence'));
      assert.ok(rels.includes('accept-claim'));
    }
  }

  // Validation failure cases
  const invalidStageRes = await app.inject({
    method: 'GET',
    url: '/api/disputes/PP-D-HATEOAS-TEST/hateoas?stage=INVALID_STAGE',
  });
  assert.equal(invalidStageRes.statusCode, 400);
  assert.equal(invalidStageRes.json().error, 'INVALID_REQUEST');

  const invalidAmountRes = await app.inject({
    method: 'GET',
    url: '/api/disputes/PP-D-HATEOAS-TEST/hateoas?amount_cents=-500',
  });
  assert.equal(invalidAmountRes.statusCode, 400);
  assert.equal(invalidAmountRes.json().error, 'INVALID_REQUEST');
});

test('Dispute Forensics API: POST /api/disputes/forensics/analyze-box validates bounding boxes and classifies defect severity', async () => {
  const app = await buildApp();

  // Valid tuple bounding box: cosmetic defect
  const tupleRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-box',
    payload: [0.1, 0.1, 0.5, 0.5],
  });
  assert.equal(tupleRes.statusCode, 200);
  const tupleJson = tupleRes.json();
  assert.equal(tupleJson.valid, true);
  assert.equal(tupleJson.defectClass, 'COSMETIC');
  assert.ok(tupleJson.defectAreaRatio > 0);
  assert.ok(tupleJson.defectSeverityScore > 0);

  // Valid object bounding box: major/critical defect
  const objRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-box',
    payload: { ymin: 0.05, xmin: 0.05, ymax: 0.95, xmax: 0.95 },
  });
  assert.equal(objRes.statusCode, 200);
  const objJson = objRes.json();
  assert.equal(objJson.valid, true);
  assert.ok(['MAJOR', 'CRITICAL', 'CRITICAL_DEFECT', 'MAJOR_DEFECT'].includes(objJson.defectClass));

  // Invalid inverted tuple (ymin >= ymax)
  const invertedTupleRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-box',
    payload: [0.8, 0.2, 0.3, 0.6],
  });
  assert.equal(invertedTupleRes.statusCode, 400);
  assert.equal(invertedTupleRes.json().error, 'INVALID_REQUEST');

  // Invalid inverted object (xmin >= xmax)
  const invertedObjRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-box',
    payload: { ymin: 0.1, xmin: 0.9, ymax: 0.4, xmax: 0.2 },
  });
  assert.equal(invertedObjRes.statusCode, 400);
  assert.equal(invertedObjRes.json().error, 'INVALID_REQUEST');

  // Coordinates out of [0, 1] range
  const outOfRangeRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-box',
    payload: [0.1, 0.1, 1.5, 0.5],
  });
  assert.equal(outOfRangeRes.statusCode, 400);
  assert.equal(outOfRangeRes.json().error, 'INVALID_REQUEST');
});

test('Dispute Forensics API: POST /api/disputes/forensics/analyze-exif identifies tamper signatures and software anomalies', async () => {
  const app = await buildApp();

  // Neutral smartphone metadata
  const neutralRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-exif',
    payload: {
      make: 'Apple',
      model: 'iPhone 15 Pro',
      software: '17.5.1',
      dateTimeOriginal: '2026-11-01T10:00:00Z',
    },
  });
  assert.equal(neutralRes.statusCode, 200);
  const neutralJson = neutralRes.json();
  assert.equal(neutralJson.exifTamperFlag, false);

  // Manipulated image with Canva / Photoshop trace
  const tamperRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/forensics/analyze-exif',
    payload: {
      software: 'Adobe Photoshop 2026 (Macintosh)',
      make: 'Apple',
    },
  });
  assert.equal(tamperRes.statusCode, 200);
  const tamperJson = tamperRes.json();
  assert.equal(tamperJson.exifTamperFlag, true);
  assert.ok(tamperJson.softwareDetected?.includes('Photoshop'));
  assert.ok(tamperJson.anomalyReasons.length > 0);
});

test('Dispute Arbitration API: POST evidence, escalate, and offer endpoints handle payloads and validation', async () => {
  const app = await buildApp();

  // 1. Submit valid evidence dossier with tracking and bounding box defect forensics
  const evidenceRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/PP-D-ARBITRATE-01/evidence',
    payload: {
      evidence_type: 'PROOF_OF_DELIVERY',
      tracking_number: '1Z9999999999999999',
      carrier_name: 'UPS',
      notes: 'Automated carrier proof of delivery dossier',
      bounding_box: [0.1, 0.2, 0.5, 0.6],
    },
  });
  assert.equal(evidenceRes.statusCode, 200);
  const evidenceJson = evidenceRes.json();
  assert.equal(evidenceJson.dispute_id, 'PP-D-ARBITRATE-01');
  assert.equal(evidenceJson.action, 'PROVIDE_EVIDENCE');
  assert.equal(evidenceJson.status, 'EVIDENCE_SUBMITTED');
  assert.ok(evidenceJson.defect_analysis);
  assert.equal(evidenceJson.defect_analysis.valid, true);

  // Inverted bounding box in evidence payload rejected with 400
  const invalidEvidenceRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/PP-D-ARBITRATE-01/evidence',
    payload: {
      evidence_type: 'PROOF_OF_DELIVERY',
      bounding_box: [0.7, 0.5, 0.2, 0.1], // Inverted
    },
  });
  assert.equal(invalidEvidenceRes.statusCode, 400);
  assert.equal(invalidEvidenceRes.json().error, 'INVALID_REQUEST');

  // 2. Escalate dispute to claim adjudication
  const escalateRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/PP-D-ARBITRATE-01/escalate',
    payload: {
      notes: 'Escalating informal inquiry to formal claim adjudication',
    },
  });
  assert.equal(escalateRes.statusCode, 200);
  const escalateJson = escalateRes.json();
  assert.equal(escalateJson.dispute_id, 'PP-D-ARBITRATE-01');
  assert.equal(escalateJson.action, 'ESCALATE_TO_CLAIM');
  assert.equal(escalateJson.current_stage, 'CLAIM');
  assert.ok(escalateJson.adjudication_result);

  // 3. Make settlement offer (partial refund)
  const offerRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/PP-D-ARBITRATE-01/offer',
    payload: {
      offer_amount_cents: 3500,
      offer_type: 'PARTIAL_REFUND',
      notes: 'Concessionary partial settlement offer',
    },
  });
  assert.equal(offerRes.statusCode, 200);
  const offerJson = offerRes.json();
  assert.equal(offerJson.dispute_id, 'PP-D-ARBITRATE-01');
  assert.equal(offerJson.action, 'MAKE_OFFER');
  assert.equal(offerJson.offer_amount_cents, 3500);
  assert.equal(offerJson.status, 'OFFER_SUBMITTED');
  assert.ok(offerJson.offer_result);

  // 4. Make return refund offer (mapped to REFUND_WITH_RETURN)
  const returnOfferRes = await app.inject({
    method: 'POST',
    url: '/api/disputes/PP-D-ARBITRATE-01/offer',
    payload: {
      offer_amount_cents: 7500,
      offer_type: 'RETURN_REFUND',
      notes: 'Full refund upon physical merchandise return',
    },
  });
  assert.equal(returnOfferRes.statusCode, 200);
  const returnOfferJson = returnOfferRes.json();
  assert.equal(returnOfferJson.offer_type, 'RETURN_REFUND');
  assert.equal(returnOfferJson.offer_result.offer.offer_type, 'REFUND_WITH_RETURN');
});
