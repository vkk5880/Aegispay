import test from 'node:test';
import assert from 'node:assert/strict';
import {
  disputeForensicsTask,
  inspectImageExifForTampering,
  isActiveDispute,
  executeAcceptClaim,
  executeCaptureRefund,
} from '../../../../workflows/src/tasks/disputeForensicsTask.js';
import {
  priceDropWatcherTask,
  queryPayPalShipmentTracking,
} from '../../../../workflows/src/tasks/priceDropWatcher.js';
import {
  projectOptimizedDisputeRecord,
  hasPdfBase64Payload,
} from '../../workers/duckdb.worker.js';
import { GET as getDossierHandler } from '../api/disputes/[id]/dossier/route.js';

test('Dispute Hardening: Routes Tier 1 settlements to POST /v1/customer/disputes/{id}/accept-claim for active disputes', async () => {
  // Test isActiveDispute detection logic
  assert.equal(isActiveDispute('PP-D-12345'), true);
  assert.equal(isActiveDispute('PP-I-99887'), true);
  assert.equal(isActiveDispute('dispute_active_77'), true);
  assert.equal(isActiveDispute('CAP-99812'), false);
  assert.equal(isActiveDispute('TX-55443'), false);
  assert.equal(isActiveDispute(''), false);
  assert.equal(isActiveDispute('NONE'), false);
  assert.equal(isActiveDispute('PRE-DISPUTE'), false);

  // Directly verify executeAcceptClaim helper returns ACCEPTED_CLAIM status
  const acceptRes = await executeAcceptClaim('PP-D-TEST-ACTIVE-1');
  assert.equal(acceptRes.dispute_id, 'PP-D-TEST-ACTIVE-1');
  assert.equal(acceptRes.status, 'RESOLVED');
  assert.ok(acceptRes.outcome.startsWith('ACCEPTED_CLAIM'));

  // Test full task routing for active dispute ID
  const stepsExecuted: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepsExecuted.push(name);
      return await fn();
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const activeDisputeResult = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PP-D-DISPUTE-ROUTING-TEST',
    autonomy_mode: 'SUPERVISED',
    force_tier: 'TIER1_REFUND',
  });

  assert.equal(activeDisputeResult.selected_tier_action, 'TIER1_REFUND');
  assert.equal(activeDisputeResult.execution_status, 'AUTO_RESOLVED');
  assert.equal(activeDisputeResult.settlement_route, 'ACCEPT_CLAIM');
  assert.ok(stepsExecuted.includes('settle-via-accept-claim'));
  assert.ok(!stepsExecuted.includes('settle-via-capture-refund'));
  assert.ok(activeDisputeResult.buyer_response.message.includes('Dispute claim accepted'));
});

test('Dispute Hardening: Reserves POST /v2/payments/captures/{id}/refund for pre-dispute transactions', async () => {
  // Directly verify executeCaptureRefund helper returns COMPLETED status
  const refundRes = await executeCaptureRefund('CAP-MOCK-991', 3500);
  assert.equal(refundRes.status, 'COMPLETED');
  assert.equal(refundRes.amount.value, '35.00');

  const stepsExecuted: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepsExecuted.push(name);
      return await fn();
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const preDisputeResult = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PRE-DISPUTE',
    capture_id: 'CAP-PRE-DISPUTE-99',
    autonomy_mode: 'SUPERVISED',
    force_tier: 'TIER1_REFUND',
  });

  assert.equal(preDisputeResult.selected_tier_action, 'TIER1_REFUND');
  assert.equal(preDisputeResult.execution_status, 'AUTO_RESOLVED');
  assert.equal(preDisputeResult.settlement_route, 'CAPTURE_REFUND');
  assert.ok(stepsExecuted.includes('settle-via-capture-refund'));
  assert.ok(!stepsExecuted.includes('settle-via-accept-claim'));
  assert.ok(preDisputeResult.buyer_response.message.includes('Pre-dispute micro-refund issued'));
});

test('Mobile-Safe Forensics: Missing EXIF or unedited images are neutral; explicit editing software tags flag tampering', async () => {
  // Test 1: Empty / Missing EXIF buffer (simulating mobile social app upload where headers are stripped)
  const emptyBuffer = Buffer.from('\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C', 'binary');
  const inspectEmpty = inspectImageExifForTampering(emptyBuffer);
  assert.equal(inspectEmpty.exif_tamper_flag, false, 'Missing EXIF headers must be treated as neutral');

  // Test 2: Standard smartphone camera EXIF (non-editing software)
  const fakeCameraExif = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x28]),
    Buffer.from('Exif\0\0II*\0\x08\0\0\0\x01\0\x31\x01\x02\0\x0e\0\0\0\x1a\0\0\0\0\0\0\0Apple iOS 18.1\0', 'binary'),
  ]);
  const inspectCamera = inspectImageExifForTampering(fakeCameraExif);
  assert.equal(inspectCamera.exif_tamper_flag, false, 'Smartphone camera software must not flag tampering');

  // Test 3: Explicit photo-editing software (Photoshop)
  const photoshopExif = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x30]),
    Buffer.from('Exif\0\0II*\0\x08\0\0\0\x01\0\x31\x01\x02\0\x14\0\0\0\x1a\0\0\0\0\0\0\0Adobe Photoshop 2026\0', 'binary'),
  ]);
  const inspectPhotoshop = inspectImageExifForTampering(photoshopExif);
  assert.equal(inspectPhotoshop.exif_tamper_flag, true, 'Photoshop software tag must set exif_tamper_flag = true');
  assert.ok(inspectPhotoshop.software?.includes('Photoshop'));

  // Test 4: Explicit Canva tag
  const canvaExif = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x24]),
    Buffer.from('Exif\0\0II*\0\x08\0\0\0\x01\0\x31\x01\x02\0\x0a\0\0\0\x1a\0\0\0\0\0\0\0Canva App\0', 'binary'),
  ]);
  const inspectCanva = inspectImageExifForTampering(canvaExif);
  assert.equal(inspectCanva.exif_tamper_flag, true, 'Canva software tag must set exif_tamper_flag = true');
});

test('Shipment-Gated 72h Price Protection: Blocks competitor void/reroute when shipment tracking is SHIPPED or IN_TRANSIT', async () => {
  // Test queryPayPalShipmentTracking helper
  const shippedTracking = await queryPayPalShipmentTracking({ trackingNumber: '9400111899220011SHIPPED' });
  assert.equal(shippedTracking.status, 'SHIPPED');

  const inTransitTracking = await queryPayPalShipmentTracking({ trackingNumber: 'TRK-TRANSIT-992' });
  assert.equal(inTransitTracking.status, 'IN_TRANSIT');

  const notShippedTracking = await queryPayPalShipmentTracking({ trackingNumber: 'MOCK_NOT_YET_DISPATCHED' });
  assert.equal(notShippedTracking.status, 'NOT_SHIPPED');

  // Test priceDropWatcher with SHIPPED order: competitor undercut must NOT trigger void/reroute
  const mockCtx: any = {
    step: async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    },
  };

  const watcherFn = (priceDropWatcherTask as any).func || priceDropWatcherTask;

  // Case A: Shipped unit hold with competitor undercut ($100 authorized, competitor $80)
  // Shipment status is locked to 'SHIPPED' -> competitor undercut cannot void order
  const shippedWatcherResult = await watcherFn(mockCtx, {
    purchase_unit_ids: ['pu_hold_shipped_unit'],
    escrow_order_id: 'escrow_shipped_test',
    channel3_product_id: 'prod_competitor_undercut',
    shipment_tracking_override: {
      pu_hold_shipped_unit: 'SHIPPED',
    },
  });

  assert.equal(shippedWatcherResult.resolutions.length, 1);
  const shippedResolution = shippedWatcherResult.resolutions[0];
  // Competitor undercut void must be prevented
  assert.notEqual(shippedResolution.action, 'VOIDED', 'Shipped order cannot be voided or rerouted to competitor');
  assert.equal(shippedResolution.action, 'RETAINED_HOLD');
  assert.equal(shippedResolution.shipment_status, 'SHIPPED');
  assert.equal(shippedResolution.reason, 'SHIPMENT_LOCKED_COMPETITOR_REROUTE_RESTRICTED');

  // Case B: Unshipped unit hold with competitor undercut ($100 authorized, competitor $80)
  // Not shipped -> competitor undercut DOES void unit independently for rerouting
  const unshippedWatcherResult = await watcherFn(mockCtx, {
    purchase_unit_ids: ['pu_hold_unshipped_unit'],
    escrow_order_id: 'escrow_unshipped_test',
    channel3_product_id: 'prod_competitor_undercut',
    shipment_tracking_override: {
      pu_hold_unshipped_unit: 'NOT_SHIPPED',
    },
  });

  assert.equal(unshippedWatcherResult.resolutions.length, 1);
  const unshippedResolution = unshippedWatcherResult.resolutions[0];
  assert.equal(unshippedResolution.action, 'VOIDED');
  assert.equal(unshippedResolution.reason, 'COMPETITOR_UNDERCUT_INDEPENDENT_VOID');
});

test('DuckDB-WASM Memory Optimization: Arrow table excludes heavy compiled PDF base64 blobs, loading dossiers on-demand', async () => {
  const mockRawRecord = {
    paypal_dispute_id: 'PP-D-DUCKDB-MEM-TEST',
    dispute_reason: 'MERCHANDISE_NOT_AS_DESCRIBED',
    dispute_state: 'REQUIRED_ACTION',
    dispute_amount_cents: 8500,
    liability_score_l: '0.22',
    abuse_risk_score_r: '0.78',
    exif_tamper_flag: true,
    selected_tier_action: 'TIER4_CONTEST_PDF',
    seller_response_due_date: new Date().toISOString(),
    compiled_evidence_pdf_base64: 'JVBERi0xLjQKJcTl8uXr...'.repeat(1000),
  };

  // 1. Verify projectOptimizedDisputeRecord projects lean Arrow row without compiled_evidence_pdf_base64
  const projectedRecord = projectOptimizedDisputeRecord(mockRawRecord);
  assert.equal(hasPdfBase64Payload(projectedRecord), false);
  assert.equal('compiled_evidence_pdf_base64' in projectedRecord, false);
  assert.equal(projectedRecord.paypal_dispute_id, 'PP-D-DUCKDB-MEM-TEST');
  assert.equal(projectedRecord.liability_score_l, 0.22);
  assert.equal(projectedRecord.abuse_risk_score_r, 0.78);
  assert.equal(projectedRecord.exif_tamper_flag, true);

  // 2. Verify on-demand dossier retrieval route GET /api/disputes/[id]/dossier
  const req = new Request('http://localhost:3000/api/disputes/PP-D-DUCKDB-MEM-TEST/dossier');
  const res = await getDossierHandler(req, {
    params: Promise.resolve({ id: 'PP-D-DUCKDB-MEM-TEST' }),
  });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.dispute_id, 'PP-D-DUCKDB-MEM-TEST');
  assert.equal(json.status, 'SUCCESS');
  assert.ok(json.compiled_evidence_pdf_base64);
  assert.ok(json.dossier_url.startsWith('https://storage.aegispay.dev/dossiers/'));
});
