import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correlateVisaCe3Evidence } from './visa-ce3-correlator.js';
import { computeDHash, computeHammingDistance, evaluatePerceptualDuplicate } from './image-hasher.js';
import { DisputeForensicsService } from './dispute-forensics.js';

describe('Visa CE 3.0 Correlator & Forensics Hardening Test Suite', () => {
  // Guardrail 3: Empty History Safety in Visa CE 3.0 Correlator
  it('Guardrail 3: returns eligible: false and INSUFFICIENT_HISTORICAL_TRANSACTIONS on empty or single history without throwing', () => {
    const currentContext = {
      dispute_id: 'PP-D-1001',
      buyer_id: 'buyer_sandbox_new',
      order: {
        id: 'ORDER-999',
        amount_cents: 15000,
        ip_address: '198.51.100.42',
        device_fingerprint: 'dev_fp_abc123',
        shipping_address: '123 Market St, San Jose, CA 95113',
      },
    };

    // Case A: 0 prior transactions
    const resEmpty = correlateVisaCe3Evidence(currentContext, []);
    assert.equal(resEmpty.eligible, false);
    assert.equal(resEmpty.reason, 'INSUFFICIENT_HISTORICAL_TRANSACTIONS');
    assert.equal(resEmpty.qualifying_transactions.length, 0);
    assert.ok(resEmpty.rebuttal_brief?.includes('Standard evidentiary rebuttal recommended'));

    // Case B: Exactly 1 prior transaction (needs >= 2 under Visa Rule 10.4)
    const resSingle = correlateVisaCe3Evidence(currentContext, [
      {
        id: 'ORDER-101',
        amount_cents: 8000,
        settled_at: '2026-03-01T12:00:00Z',
        status: 'COMPLETED',
        has_dispute: false,
        ip_address: '198.51.100.42',
        device_fingerprint: 'dev_fp_abc123',
        shipping_address: '123 Market St, San Jose, CA 95113',
      },
    ]);
    assert.equal(resSingle.eligible, false);
    assert.equal(resSingle.reason, 'INSUFFICIENT_HISTORICAL_TRANSACTIONS');
    assert.equal(resSingle.qualifying_transactions.length, 1);
  });

  it('Visa CE 3.0: qualifies when >= 2 undisputed settled orders match customer qualifiers', () => {
    const currentContext = {
      dispute_id: 'PP-D-2002',
      buyer_id: 'buyer_established_45',
      order: {
        id: 'ORDER-CURR',
        amount_cents: 25000,
        ip_address: '203.0.113.19',
        device_fingerprint: 'fp_hardware_x99',
        shipping_address: '456 PayPal Way, San Jose, CA 95131',
      },
    };

    const history = [
      {
        id: 'ORDER-PAST-1',
        amount_cents: 12000,
        settled_at: '2026-01-15T10:30:00Z',
        status: 'COMPLETED',
        has_dispute: false,
        ip_address: '203.0.113.19',
        device_fingerprint: 'fp_hardware_x99',
        shipping_address: '456 PayPal Way, San Jose, CA 95131',
      },
      {
        id: 'ORDER-PAST-2',
        amount_cents: 18500,
        settled_at: '2026-02-20T14:15:00Z',
        status: 'COMPLETED',
        has_dispute: false,
        ip_address: '203.0.113.19',
        device_fingerprint: 'fp_hardware_x99',
        shipping_address: '456 PayPal Way, San Jose, CA 95131',
      },
      {
        id: 'ORDER-DISPUTED',
        amount_cents: 5000,
        settled_at: '2026-02-28T09:00:00Z',
        status: 'COMPLETED',
        has_dispute: true, // Should be excluded from compelling evidence
        ip_address: '203.0.113.19',
        device_fingerprint: 'fp_hardware_x99',
      },
    ];

    const res = correlateVisaCe3Evidence(currentContext, history);
    assert.equal(res.eligible, true);
    assert.equal(res.qualifying_transactions.length, 2);
    assert.ok(res.correlation_confidence >= 90);
    assert.ok(res.rebuttal_brief?.includes('VISA COMPELLING EVIDENCE 3.0 (RULE 10.4)'));
    assert.ok(res.rebuttal_brief?.includes('ORDER-PAST-1'));
    assert.ok(res.rebuttal_brief?.includes('ORDER-PAST-2'));
    assert.equal(res.exhibit_hashes?.length, 3);
  });

  // Guardrail 1: Pure TypeScript dHash (No Native C++ Binaries)
  it('Guardrail 1: computes 64-bit dHash in pure TypeScript without native C++ libraries', () => {
    // Generate two synthetic test buffers (simulating JPEG byte streams)
    const bufA = Buffer.alloc(1024);
    for (let i = 0; i < bufA.length; i++) {
      bufA[i] = (i * 7) % 256;
    }

    const dHashA = computeDHash(bufA);
    assert.equal(dHashA.length, 16);
    assert.match(dHashA, /^[0-9a-f]{16}$/);

    // Identical buffer must yield identical dHash and 0 Hamming distance
    const dHashA2 = computeDHash(bufA);
    assert.equal(dHashA, dHashA2);
    assert.equal(computeHammingDistance(dHashA, dHashA2), 0);

    // Slightly modified buffer (1 byte changed)
    const bufB = Buffer.from(bufA);
    bufB[200] = (bufB[200] + 10) % 256;
    const dHashB = computeDHash(bufB);
    const dist = computeHammingDistance(dHashA, dHashB);
    assert.ok(dist <= 5, 'Close visual similarity should yield low Hamming distance');
  });

  it('Guardrail 1: evaluatePerceptualDuplicate detects duplicate or reused claim photos', () => {
    const originalBuf = Buffer.alloc(2048, 120);
    const originalHash = computeDHash(originalBuf);
    const originalSha = 'a'.repeat(64);

    const knownRecords = [
      {
        claim_id: 'CLAIM-PRIOR-77',
        sha256: originalSha,
        dHash: originalHash,
      },
    ];

    const duplicateCheck = evaluatePerceptualDuplicate(originalBuf, knownRecords, 5);
    assert.equal(duplicateCheck.is_duplicate, true);
    assert.equal(duplicateCheck.matched_claim_id, 'CLAIM-PRIOR-77');
  });

  // Lost-in-Transit Fee Avoidance & Post-Loss Recovery
  it('handleLostInTransitFeeAvoidance: accepts claim to avoid $15+ fee when carrier confirms lost', async () => {
    let acceptedClaimId: string | undefined;
    const mockPayPalClient: any = {
      acceptDisputeClaim: async (disputeId: string) => {
        acceptedClaimId = disputeId;
        return { status: 'CLAIM_ACCEPTED', fee_avoided: true };
      },
    };

    const forensics = new DisputeForensicsService(mockPayPalClient);

    // Case A: Carrier confirms LOST_IN_TRANSIT
    const resLost = await forensics.handleLostInTransitFeeAvoidance('DISP-CARRIER-LOST', 'LOST_IN_TRANSIT');
    assert.equal(resLost.handled, true);
    assert.equal(resLost.feeAvoided, true);
    assert.equal(acceptedClaimId, 'DISP-CARRIER-LOST');

    // Case B: Carrier confirms IN_TRANSIT (not lost)
    const resInTransit = await forensics.handleLostInTransitFeeAvoidance('DISP-ON-THE-WAY', 'IN_TRANSIT');
    assert.equal(resInTransit.handled, false);
    assert.equal(resInTransit.feeAvoided, false);
  });

  it('scanPostLossDeliveredRecovery: generates recovery demand letter when tracking updates to DELIVERED', () => {
    const forensics = new DisputeForensicsService();

    // Case A: Tracking flipped to DELIVERED
    const recoveryRes = forensics.scanPostLossDeliveredRecovery(
      'DISP-RESOLVED-99',
      'buyer@example.com',
      'ORD-5544',
      12000,
      'DELIVERED'
    );
    assert.equal(recoveryRes.recoveryEligible, true);
    assert.ok(recoveryRes.demandLetter?.includes('POST-DISPUTE REVENUE RECOVERY DEMAND'));
    assert.ok(recoveryRes.demandLetter?.includes('$120.00'));
    assert.equal(recoveryRes.settlementPayload?.order_id, 'ORD-5544');

    // Case B: Tracking still OUT_FOR_DELIVERY
    const pendingRes = forensics.scanPostLossDeliveredRecovery(
      'DISP-RESOLVED-99',
      'buyer@example.com',
      'ORD-5544',
      12000,
      'OUT_FOR_DELIVERY'
    );
    assert.equal(pendingRes.recoveryEligible, false);
  });
});
