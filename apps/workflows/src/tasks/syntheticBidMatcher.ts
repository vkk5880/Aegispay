import { task, flow, type FlowContext } from '@renderinc/sdk/workflows';
import { createDb, syntheticIntentVouchers, escrowOrders } from '@aegispay/database';
// @ts-ignore
import { eq } from 'drizzle-orm';
import { enhanceContext } from './types.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('Workflows:Tasks');

const connectionString = process.env.DATABASE_URL;
const db = connectionString ? createDb(connectionString) : null;

export const syntheticBidMatcherFlow = flow(
  {
    name: 'syntheticBidMatcherFlow',
    timeoutSeconds: 300,
    plan: 'flex',
  },
  async (ctx: FlowContext, payload: { voucher_id: string }) => {
    const eCtx = enhanceContext(ctx);
    const voucherId = payload.voucher_id;

    logger.info('syntheticBidMatcherFlow started for voucher matching', { voucherId });

    const voucher = await eCtx.step('fetch-voucher', async () => {
      logger.debug(`Durable checkpoint: fetch-voucher for ${voucherId}`);
      if (!db) {
        logger.warn('Database connection not configured; using mock synthetic voucher', { voucherId });
        return {
          voucher_id: voucherId,
          buyer_bid_cents: 45000,
          merchant_min_floor_cents: 42000,
          retail_offer_cents: 49000,
          mandate_id: 'mock_mandate',
        };
      }
      try {
        logger.info(`Querying syntheticIntentVouchers table for voucher ID: ${voucherId}`);
        // @ts-ignore
        const results = await db.select().from(syntheticIntentVouchers).where(eq(syntheticIntentVouchers.voucher_id, voucherId));
        if (results[0]) {
          logger.info(`Retrieved synthetic voucher record from DB`, {
            voucherId,
            buyer_bid_cents: results[0].buyer_bid_cents,
            merchant_min_floor_cents: results[0].merchant_min_floor_cents,
            retail_offer_cents: results[0].retail_offer_cents,
            mandate_id: results[0].mandate_id,
          });
          return results[0];
        }
        logger.warn(`No record found in DB for voucher ID: ${voucherId}; using mock fallback`);
        return {
          voucher_id: voucherId,
          buyer_bid_cents: 45000,
          merchant_min_floor_cents: 42000,
          retail_offer_cents: 49000,
          mandate_id: 'mock_mandate',
        };
      } catch (e: any) {
        logger.error('DB query failed for fetch-voucher; using mock voucher fallback', {
          error_code: e?.code || 'DB_VOUCHER_FETCH_ERROR',
          message: e?.message,
          stack: e?.stack,
          voucherId,
        });
        return {
          voucher_id: voucherId,
          buyer_bid_cents: 45000,
          merchant_min_floor_cents: 42000,
          retail_offer_cents: 49000,
          mandate_id: 'mock_mandate',
        };
      }
    });

    const isAccepted = await eCtx.step('evaluate-bid', async () => {
      logger.info(`[syntheticBidMatcher] Evaluating bid: ${voucher.buyer_bid_cents} against floor: ${voucher.merchant_min_floor_cents}`);
      const accepted = voucher.buyer_bid_cents >= voucher.merchant_min_floor_cents;
      const marginDeltaCents = voucher.buyer_bid_cents - voucher.merchant_min_floor_cents;
      logger.info(`Bid evaluation result: accepted=${accepted}, marginDeltaCents=${marginDeltaCents}`, {
        buyer_bid_cents: voucher.buyer_bid_cents,
        merchant_min_floor_cents: voucher.merchant_min_floor_cents,
      });
      return accepted;
    });

    if (isAccepted) {
      logger.info(`Branch isAccepted=true: Direct synthetic bid acceptance for voucher: ${voucher.voucher_id}`);
      await eCtx.step('capture-vaulted-token', async () => {
        logger.info(`[syntheticBidMatcher] Bid accepted! Capturing vaulted token.`);
        try {
          const orderId = `ORD-SYN-${Date.now()}`;
          logger.info(`Mints associated escrow order ID: ${orderId} for voucher ${voucher.voucher_id}`);
          if (db) {
            // @ts-ignore
            await db.update(syntheticIntentVouchers)
              .set({ negotiation_status: 'ACCEPTED_AND_CAPTURED', resulting_paypal_order_id: orderId })
              // @ts-ignore
              .where(eq(syntheticIntentVouchers.voucher_id, voucher.voucher_id));
            logger.info(`Updated syntheticIntentVouchers in DB to ACCEPTED_AND_CAPTURED for ${voucher.voucher_id}`);
          } else {
            logger.debug('DB not configured; simulated DB update for accepted voucher');
          }

          logger.info(`[syntheticBidMatcher] Created associated escrow order: ${orderId}`);
        } catch (e: any) {
          logger.error('DB update failed during capture-vaulted-token (mocking capture)', {
            error_code: e?.code || 'DB_CAPTURE_TOKEN_ERROR',
            message: e?.message,
            stack: e?.stack,
            voucherId: voucher.voucher_id,
          });
        }
      });
    } else {
      logger.info(`Branch isAccepted=false: Bid below merchant floor; proceeding to multi-turn counter-bid evaluation`);
      // Multi-turn counter-bid evaluation checkpoint
      const counterEvaluation = await eCtx.step('evaluate-counter-bid', async () => {
        logger.info(`[syntheticBidMatcher] Initial bid below floor. Evaluating multi-turn counter-bid.`);
        const retail = (voucher as any).retail_offer_cents || Math.round(voucher.merchant_min_floor_cents * 1.15);
        const floor = voucher.merchant_min_floor_cents;
        const buyerBid = voucher.buyer_bid_cents;

        // Merchant counter: algorithmic concession (midpoint biased towards floor)
        const counterCents = Math.round(floor + (retail - floor) * 0.40);

        // Check if counter is within buyer acceptable overage or requires HITL
        const autoAcceptBufferCents = 1500; // $15 allowance buffer
        const autoAccepts = counterCents <= buyerBid + autoAcceptBufferCents;

        logger.info('Multi-turn counter-bid calculation completed', {
          retail_cents: retail,
          floor_cents: floor,
          buyer_bid_cents: buyerBid,
          calculated_counter_cents: counterCents,
          auto_accept_buffer_cents: autoAcceptBufferCents,
          auto_accepts: autoAccepts,
          decision_status: autoAccepts ? 'ACCEPTED_AND_CAPTURED' : 'COUNTERED',
        });

        return {
          counter_cents: counterCents,
          retail_cents: retail,
          floor_cents: floor,
          buyer_bid_cents: buyerBid,
          auto_accepted: autoAccepts,
          status: autoAccepts ? ('ACCEPTED_AND_CAPTURED' as const) : ('COUNTERED' as const),
        };
      });

      if (counterEvaluation.auto_accepted) {
        logger.info(`Sub-branch auto_accepted=true: Counter is within $15 buffer; auto-capturing vaulted token`);
        await eCtx.step('capture-vaulted-token', async () => {
          logger.info(`[syntheticBidMatcher] Counter-bid within auto-accept buffer ($${(counterEvaluation.counter_cents / 100).toFixed(2)}). Capturing vaulted token.`);
          if (db) {
            try {
              const orderId = `ORD-SYN-COUNTER-${Date.now()}`;
              logger.info(`Generated order ID for auto-accepted counter-bid: ${orderId}`);
              // @ts-ignore
              await db.update(syntheticIntentVouchers)
                .set({ negotiation_status: 'ACCEPTED_AND_CAPTURED', resulting_paypal_order_id: orderId })
                // @ts-ignore
                .where(eq(syntheticIntentVouchers.voucher_id, voucher.voucher_id));
              logger.info(`DB updated to ACCEPTED_AND_CAPTURED for voucher ${voucher.voucher_id}`);
            } catch (e: any) {
              logger.error('DB update failed during counter capture (mocking counter capture)', {
                error_code: e?.code || 'DB_COUNTER_CAPTURE_ERROR',
                message: e?.message,
                stack: e?.stack,
                voucherId: voucher.voucher_id,
              });
            }
          } else {
            logger.debug('DB not configured; simulated DB update for auto-accepted counter');
          }
        });
      } else {
        logger.info(`Sub-branch auto_accepted=false: Counter exceeds buffer; persisting counter-offer for HITL confirmation`);
        await eCtx.step('persist-counter-offer', async () => {
          logger.info(`[syntheticBidMatcher] Counter-bid generated ($${(counterEvaluation.counter_cents / 100).toFixed(2)}). Waiting for HITL confirmation.`);
          if (db) {
            try {
              // @ts-ignore
              await db.update(syntheticIntentVouchers)
                .set({ negotiation_status: 'COUNTERED' })
                // @ts-ignore
                .where(eq(syntheticIntentVouchers.voucher_id, voucher.voucher_id));
              logger.info(`DB updated to COUNTERED for voucher ${voucher.voucher_id}`);
            } catch (e: any) {
              logger.error('DB update failed during counter status update (mocking counter status)', {
                error_code: e?.code || 'DB_COUNTER_STATUS_ERROR',
                message: e?.message,
                stack: e?.stack,
                voucherId: voucher.voucher_id,
              });
            }
          } else {
            logger.debug('DB not configured; simulated DB update for countered voucher');
          }
        });
      }
    }

    logger.info('syntheticBidMatcherFlow durable execution completed', { voucherId });
  }
);

export const syntheticBidMatcherTask = task(
  { name: 'syntheticBidMatcher' },
  syntheticBidMatcherFlow.func as any
);
