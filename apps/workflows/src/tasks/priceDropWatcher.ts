import { task } from '@renderinc/sdk/workflows';
import { createDb, purchaseUnitHolds, escrowOrders } from '@aegispay/database';
// @ts-ignore
import { eq } from 'drizzle-orm';
import { enhanceContext } from './types.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/aegispay';
const db = createDb(connectionString);

class MockChannel3Client {
  async lookup(productIds: string[]) {
    return [{
      product_id: productIds[0],
      offers: [
        { domain: 'mock_domain.com', price: 9000 },
        { domain: 'competitor.com', price: 12000 }
      ]
    }];
  }
}

const channel3 = new MockChannel3Client();

export const priceDropWatcherTask = task({ name: 'priceDropWatcher' }, async (ctx, payload: { purchase_unit_id: string }) => {
  const eCtx = enhanceContext(ctx);
  const puId = payload.purchase_unit_id;

  const puHold = await eCtx.step('fetch-pu-hold', async () => {
    try {
      // @ts-ignore
      const holds = await db.select().from(purchaseUnitHolds).where(eq(purchaseUnitHolds.id, puId));
      return holds[0] || {
        id: puId,
        channel3_product_id: 'mock_prod',
        merchant_domain: 'mock_domain.com',
        authorized_cents: 10000,
        target_price_drop_cents: 9500,
        escrow_order_id: 'mock_escrow'
      };
    } catch (e) {
      console.warn("DB not available, using mock puHold");
      return {
        id: puId,
        channel3_product_id: 'mock_prod',
        merchant_domain: 'mock_domain.com',
        authorized_cents: 10000,
        target_price_drop_cents: 9500,
        escrow_order_id: 'mock_escrow'
      };
    }
  });

  const lookupResult = await eCtx.step('poll-channel3-lookup', async () => {
    const results = await channel3.lookup([puHold.channel3_product_id]);
    return results[0];
  });

  const sameMerchantOffers = lookupResult.offers.filter(o => o.domain === puHold.merchant_domain);
  const currentLowestPrice = sameMerchantOffers.length > 0 ? Math.min(...sameMerchantOffers.map(o => o.price)) : puHold.authorized_cents;

  const competitorOffers = lookupResult.offers.filter(o => o.domain !== puHold.merchant_domain);
  const competitorLowestPrice = competitorOffers.length > 0 ? Math.min(...competitorOffers.map(o => o.price)) : Infinity;

  if (currentLowestPrice <= puHold.target_price_drop_cents) {
    await eCtx.step('capture-lower-price', async () => {
       console.log(`[priceDropWatcher] Capturing lower price: ${currentLowestPrice}`);
       try {
         // @ts-ignore
         await db.update(purchaseUnitHolds)
           .set({ hold_status: 'CAPTURED_PRICE_DROP', final_captured_cents: currentLowestPrice })
           // @ts-ignore
           .where(eq(purchaseUnitHolds.id, puHold.id));
         // @ts-ignore
         await db.update(escrowOrders)
           .set({ order_status: 'CAPTURED_PRICE_DROP' })
           // @ts-ignore
           .where(eq(escrowOrders.id, puHold.escrow_order_id));
       } catch (e) {
         console.warn("DB update failed (mocking capture)", e);
       }
    });
  } else if (competitorLowestPrice < puHold.authorized_cents) {
     await eCtx.step('void-and-reroute', async () => {
       console.log(`[priceDropWatcher] Competitor undercut. Voiding hold.`);
       try {
         // @ts-ignore
         await db.update(purchaseUnitHolds)
           .set({ hold_status: 'VOIDED_UNDERCUT' })
           // @ts-ignore
           .where(eq(purchaseUnitHolds.id, puHold.id));
         // @ts-ignore
         await db.update(escrowOrders)
           .set({ order_status: 'VOIDED_UNDERCUT' })
           // @ts-ignore
           .where(eq(escrowOrders.id, puHold.escrow_order_id));
       } catch (e) {
         console.warn("DB update failed (mocking void)", e);
       }
     });
  }
});
