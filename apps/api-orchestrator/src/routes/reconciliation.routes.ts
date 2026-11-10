import { FastifyPluginAsync } from 'fastify';
import { defaultPayPalClient, PayPalApimaticClient } from '../services/paypal-apimatic.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

export const logger = createLogger('API:Routes:Reconciliation');

export interface CsvLedgerRow {
  order_id: string;
  expected_amount_cents?: number;
  expected_amount_usd?: number | string;
  notes?: string;
}

export interface ReconciliationItemResult {
  order_id: string;
  expected_cents: number;
  actual_cents: number;
  status: 'MATCHED' | 'UNDERPAID' | 'OVERPAID' | 'MISSING_CAPTURE';
  discrepancy_cents: number;
  explanation: string;
}

export const reconciliationRoutes: FastifyPluginAsync<{
  paypalClient?: PayPalApimaticClient;
}> = async (fastify, opts) => {
  const paypalClient = opts.paypalClient || defaultPayPalClient;

  /**
   * Helper to parse CSV string into structured ledger rows.
   */
  const parseCsvText = (csvText: string): CsvLedgerRow[] => {
    logger.debug('Parsing raw CSV text for merchant reconciliation', {
      textLength: csvText.length,
    });
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      logger.warn('CSV parsing aborted: empty or header-only content', { lineCount: lines.length });
      return [];
    }

    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const orderIdIdx = headers.findIndex((h) => h.includes('order') || h.includes('id'));
    const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('total') || h.includes('cents'));
    const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('desc'));

    logger.debug('CSV column header indices mapped', {
      orderIdIdx,
      amountIdx,
      notesIdx,
      headers,
    });

    const rows: CsvLedgerRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols[orderIdIdx]) continue;

      const order_id = cols[orderIdIdx];
      const rawAmount = cols[amountIdx] || '0';
      const parsedAmount = parseFloat(rawAmount.replace(/[^0-9.-]+/g, '')) || 0;

      rows.push({
        order_id,
        expected_amount_cents: Math.round(parsedAmount * 100),
        notes: notesIdx >= 0 ? cols[notesIdx] : undefined,
      });
    }

    logger.info(`Parsed ${rows.length} valid ledger rows from ${lines.length - 1} data lines`);
    return rows;
  };

  /**
   * POST /api/merchant/reconcile-csv
   * Reconciles merchant ERP CSV ledger against PayPal Orders v2 & capture records.
   */
  fastify.post('/api/merchant/reconcile-csv', async (request, reply) => {
    const body = request.body as any;
    let ledgerRows: CsvLedgerRow[] = [];

    logger.info('Received merchant reconciliation request', {
      hasCsvContent: Boolean(body?.csv_content),
      hasRowsArray: Array.isArray(body?.rows),
      rowsCount: Array.isArray(body?.rows) ? body.rows.length : undefined,
    });

    if (body?.csv_content && typeof body.csv_content === 'string') {
      ledgerRows = parseCsvText(body.csv_content);
    } else if (Array.isArray(body?.rows)) {
      ledgerRows = body.rows.map((row: any) => ({
        order_id: String(row.order_id || ''),
        expected_amount_cents:
          typeof row.expected_amount_cents === 'number'
            ? row.expected_amount_cents
            : Math.round((parseFloat(String(row.expected_amount_usd || '0')) || 0) * 100),
        notes: row.notes,
      }));
      logger.info(`Extracted ${ledgerRows.length} rows directly from body.rows array`);
    } else {
      logger.warn('Reconciliation request payload invalid: missing both csv_content and rows');
      return reply.status(400).send({
        error: 'Invalid payload: provide either csv_content string or rows array',
      });
    }

    const items: ReconciliationItemResult[] = [];
    let matchedCount = 0;
    let mismatchedCount = 0;
    let totalDiscrepancyCents = 0;

    logger.info(`Starting reconciliation loop for ${ledgerRows.length} ledger records`);

    for (const row of ledgerRows) {
      if (!row.order_id) {
        logger.debug('Skipping ledger row missing order_id');
        continue;
      }
      const expectedCents = row.expected_amount_cents || 0;

      let actualCents = 0;
      let orderStatus = 'UNKNOWN';

      logger.debug(`Looking up PayPal order details for order '${row.order_id}'`);
      try {
        const orderDetails = await paypalClient.getOrder(row.order_id);
        if (orderDetails && typeof orderDetails === 'object') {
          orderStatus = (orderDetails as any).status || 'UNKNOWN';
          const units = (orderDetails as any).purchase_units || (orderDetails as any).purchaseUnits;
          if (Array.isArray(units) && units[0]?.amount?.value) {
            actualCents = Math.round(parseFloat(units[0].amount.value) * 100);
          }
        }
        logger.debug(`PayPal order lookup succeeded for '${row.order_id}'`, {
          orderStatus,
          actualCents,
          expectedCents,
        });
      } catch (err: any) {
        logger.error(`PayPal order lookup failed for order '${row.order_id}': ${err?.message || err}`, {
          route: '/api/merchant/reconcile-csv',
          orderId: row.order_id,
          code: 'PAYPAL_ORDER_LOOKUP_FAILED',
          stack: err?.stack,
        });
        // Order lookup failure: treated as missing capture
      }

      const diffCents = actualCents - expectedCents;
      totalDiscrepancyCents += Math.abs(diffCents);

      if (actualCents === 0 && orderStatus !== 'COMPLETED') {
        mismatchedCount++;
        items.push({
          order_id: row.order_id,
          expected_cents: expectedCents,
          actual_cents: 0,
          status: 'MISSING_CAPTURE',
          discrepancy_cents: expectedCents,
          explanation: `Order ${row.order_id} expected $${(expectedCents / 100).toFixed(2)} has no confirmed PayPal capture on record.`,
        });
      } else if (diffCents === 0) {
        matchedCount++;
        items.push({
          order_id: row.order_id,
          expected_cents: expectedCents,
          actual_cents: actualCents,
          status: 'MATCHED',
          discrepancy_cents: 0,
          explanation: `Order ${row.order_id} perfectly reconciled against PayPal capture of $${(actualCents / 100).toFixed(2)}.`,
        });
      } else if (diffCents < 0) {
        mismatchedCount++;
        items.push({
          order_id: row.order_id,
          expected_cents: expectedCents,
          actual_cents: actualCents,
          status: 'UNDERPAID',
          discrepancy_cents: Math.abs(diffCents),
          explanation: `Order ${row.order_id} underpaid: expected $${(expectedCents / 100).toFixed(2)} but captured $${(actualCents / 100).toFixed(2)} (shortage of $${(Math.abs(diffCents) / 100).toFixed(2)}).`,
        });
      } else {
        mismatchedCount++;
        items.push({
          order_id: row.order_id,
          expected_cents: expectedCents,
          actual_cents: actualCents,
          status: 'OVERPAID',
          discrepancy_cents: diffCents,
          explanation: `Order ${row.order_id} overpaid: expected $${(expectedCents / 100).toFixed(2)} but captured $${(actualCents / 100).toFixed(2)} (surplus of $${(diffCents / 100).toFixed(2)}).`,
        });
      }
    }

    const reconciliationRatePercent =
      items.length > 0 ? Number(((matchedCount / items.length) * 100).toFixed(2)) : 100;

    logger.info('Reconciliation completed', {
      totalRecords: items.length,
      matchedCount,
      mismatchedCount,
      totalDiscrepancyCents,
      reconciliationRatePercent,
    });

    return reply.status(200).send({
      total_records: items.length,
      matched_count: matchedCount,
      mismatched_count: mismatchedCount,
      total_discrepancy_cents: totalDiscrepancyCents,
      reconciliation_rate_percent: reconciliationRatePercent,
      items,
    });
  });
};
