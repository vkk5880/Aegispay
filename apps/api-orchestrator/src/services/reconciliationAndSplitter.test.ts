import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitGroupExpense } from './group-cart-splitter.js';
import Fastify from 'fastify';
import { reconciliationRoutes } from '../routes/reconciliation.routes.js';

describe('Group Expense Splitter & Merchant CSV Reconciliation Suite', () => {
  it('splitGroupExpense: enforces exact integer cent conservation on uneven 3-way split ($10.00)', () => {
    const res = splitGroupExpense({
      total_cents: 1000, // $10.00
      tip_cents: 0,
      tax_cents: 0,
      participants: [
        { id: 'user_1', name: 'Alice' },
        { id: 'user_2', name: 'Bob' },
        { id: 'user_3', name: 'Charlie' },
      ],
    });

    assert.equal(res.total_cents, 1000);
    assert.equal(res.shares.length, 3);

    // Sum of shares must equal exactly 1000 cents
    const sumCents = res.shares.reduce((acc, s) => acc + s.share_cents, 0);
    assert.equal(sumCents, 1000);

    // One person gets 334, two get 333
    const shareValues = res.shares.map((s) => s.share_cents).sort();
    assert.deepEqual(shareValues, [333, 333, 334]);
  });

  it('splitGroupExpense: supports custom weights and tip/tax allocations', () => {
    const res = splitGroupExpense({
      total_cents: 8000, // $80.00
      tip_cents: 1500,  // $15.00
      tax_cents: 500,   // $5.00 -> Grand Total $100.00 (10000 cents)
      participants: [
        { id: 'p1', name: 'Organizer', weight: 2 },
        { id: 'p2', name: 'Member A', weight: 1 },
        { id: 'p3', name: 'Member B', weight: 1 },
      ],
    });

    assert.equal(res.total_cents, 10000);
    const sumCents = res.shares.reduce((acc, s) => acc + s.share_cents, 0);
    assert.equal(sumCents, 10000);

    const orgShare = res.shares.find((s) => s.participant_id === 'p1');
    const memberShare = res.shares.find((s) => s.participant_id === 'p2');
    assert.equal(orgShare?.share_cents, 5000); // 50% of 10000
    assert.equal(memberShare?.share_cents, 2500); // 25% of 10000
  });

  it('reconciliationRoutes: parses CSV records and classifies MATCHED, UNDERPAID, and MISSING_CAPTURE', async () => {
    const mockPayPalClient: any = {
      getOrder: async (orderId: string) => {
        if (orderId === 'ORD-MATCH') {
          return { status: 'COMPLETED', purchase_units: [{ amount: { value: '45.00' } }] };
        }
        if (orderId === 'ORD-SHORT') {
          return { status: 'COMPLETED', purchase_units: [{ amount: { value: '30.00' } }] };
        }
        throw new Error('Not found');
      },
    };

    const app = Fastify();
    await app.register(reconciliationRoutes, { paypalClient: mockPayPalClient });

    const csvContent = [
      'Order ID, Amount USD, Notes',
      'ORD-MATCH, 45.00, Complete office chair',
      'ORD-SHORT, 50.00, Wireless desk lamp (partial capture)',
      'ORD-MISSING, 25.00, Ergonomic mouse (unfulfilled)',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/reconcile-csv',
      payload: { csv_content: csvContent },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.total_records, 3);
    assert.equal(body.matched_count, 1);
    assert.equal(body.mismatched_count, 2);

    const matchItem = body.items.find((i: any) => i.order_id === 'ORD-MATCH');
    assert.equal(matchItem.status, 'MATCHED');
    assert.equal(matchItem.discrepancy_cents, 0);

    const underpaidItem = body.items.find((i: any) => i.order_id === 'ORD-SHORT');
    assert.equal(underpaidItem.status, 'UNDERPAID');
    assert.equal(underpaidItem.discrepancy_cents, 2000); // 5000 - 3000 = 2000 cents ($20)

    const missingItem = body.items.find((i: any) => i.order_id === 'ORD-MISSING');
    assert.equal(missingItem.status, 'MISSING_CAPTURE');
  });
});
