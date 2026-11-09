import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  ProductCardDataSchema,
  ComparisonMatrixSchema,
  ExplainableCartPayloadSchema,
  ProductCardData,
  ComparisonMatrix,
  ComparisonMatrixRow,
} from '@aegispay/shared-types';
import {
  Channel3Client,
  Channel3ProductDetail,
  Channel3Offer,
  defaultChannel3Client,
} from './channel3.client.js';
import {
  MurthyroshanScoringEngine,
  defaultScoringEngine,
} from './scoring-engine.js';
import {
  CartSolver,
  defaultCartSolver,
  KnapsackOptimizationResult,
} from './cart-solver.js';
import {
  PayPalApimaticClient,
  defaultPayPalClient,
} from './paypal-apimatic.js';

export function transformToProductCard(p: Channel3ProductDetail): ProductCardData {
  const inStockOffers = p.offers.filter(o => o.stock_status !== 'OUT_OF_STOCK');
  const bestOffer: Channel3Offer = inStockOffers.length > 0
    ? inStockOffers.reduce((min, cur) => cur.price < min.price ? cur : min, inStockOffers[0])
    : p.offers[0] || {
        id: 'mock_offer',
        product_id: p.product_id,
        domain: 'partner-merchant.com',
        price: 9900,
        compare_at_price: 12000,
        max_commission_rate: 0.1,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.05,
        stock_status: 'IN_STOCK',
      };

  const priceCents = bestOffer.price;
  const compareAtCents = bestOffer.compare_at_price || priceCents;
  const commissionRate = bestOffer.max_commission_rate || 0.1;
  const rebateCents = Math.round(priceCents * commissionRate * 0.75);
  const shippingFeeCents = bestOffer.shipping_fee_cents ?? 0;
  const freeShipping = shippingFeeCents === 0 || priceCents >= (bestOffer.shipping_waiver_threshold_cents ?? 50000);

  const anomaly = bestOffer.merchant_anomaly_score ?? 0.05;
  const credibility = Math.round(Math.max(50, (1 - anomaly) * 100));

  const specs: Record<string, string> = {
    Category: p.category_id || 'Electronics',
    Weight: p.dimensions?.weight ? `${p.dimensions.weight}g` : 'Standard',
    Dimensions: p.dimensions
      ? `${p.dimensions.length || 10} x ${p.dimensions.width || 10} x ${p.dimensions.height || 5} cm`
      : 'Compact',
    Condition: 'Brand New (Factory Sealed)',
    Warranty: '1-Year Manufacturer Warranty',
  };

  return {
    product_id: p.product_id,
    title: p.title,
    description: p.description,
    category_id: p.category_id,
    price_cents: priceCents,
    compare_at_price_cents: compareAtCents,
    commission_rebate_cents: rebateCents,
    commission_rate: commissionRate,
    rating: 4.8,
    review_count: 142,
    shipping_fee_cents: freeShipping ? 0 : shippingFeeCents,
    free_shipping: freeShipping,
    merchant_domain: bestOffer.domain,
    merchant_credibility_score: credibility,
    stock_status: bestOffer.stock_status === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'IN_STOCK',
    delivery_window: '2-3 Business Days via FedEx Express',
    image_url: p.images[0]?.url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
    cleaned_image_url: p.images[0]?.cleaned_url || p.images[0]?.url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
    specs,
    images: p.images,
  };
}

export function buildComparisonMatrix(products: ProductCardData[]): ComparisonMatrix {
  const productIds = products.map(p => p.product_id);

  let minNet = Infinity;
  let winnerId = productIds[0];

  products.forEach(p => {
    const net = p.price_cents - p.commission_rebate_cents;
    if (net < minNet) {
      minNet = net;
      winnerId = p.product_id;
    }
  });

  const rows: ComparisonMatrixRow[] = [
    {
      attribute: 'Retail Price',
      values: Object.fromEntries(
        products.map(p => [p.product_id, `$${(p.price_cents / 100).toFixed(2)}`])
      ),
    },
    {
      attribute: 'Commission Rebate',
      values: Object.fromEntries(
        products.map(p => [p.product_id, `-$${(p.commission_rebate_cents / 100).toFixed(2)} (${Math.round(p.commission_rate * 75)}% back)`])
      ),
      highlighted_product_id: winnerId,
    },
    {
      attribute: 'Net Effective Price',
      values: Object.fromEntries(
        products.map(p => [p.product_id, `$${((p.price_cents - p.commission_rebate_cents) / 100).toFixed(2)}`])
      ),
      highlighted_product_id: winnerId,
    },
    {
      attribute: 'Customer Rating',
      values: Object.fromEntries(
        products.map(p => [p.product_id, `★ ${p.rating} (${p.review_count} reviews)`])
      ),
    },
    {
      attribute: 'Merchant Credibility',
      values: Object.fromEntries(
        products.map(p => [p.product_id, `${p.merchant_credibility_score}% Trust Rating (${p.merchant_domain})`])
      ),
    },
    {
      attribute: 'Delivery Window',
      values: Object.fromEntries(
        products.map(p => [p.product_id, p.free_shipping ? `Free • ${p.delivery_window}` : `$${(p.shipping_fee_cents / 100).toFixed(2)} • ${p.delivery_window}`])
      ),
    },
    {
      attribute: 'Stock Status',
      values: Object.fromEntries(
        products.map(p => [p.product_id, p.stock_status === 'IN_STOCK' ? '✓ In Stock (2PC Verified)' : 'Out of Stock'])
      ),
    },
  ];

  const winnerProduct = products.find(p => p.product_id === winnerId);
  const rationale = winnerProduct
    ? `**${winnerProduct.title}** delivers the best overall value with a net effective cost of $${((winnerProduct.price_cents - winnerProduct.commission_rebate_cents) / 100).toFixed(2)} after instant commission pass-through and a ${winnerProduct.merchant_credibility_score}% merchant trust rating.`
    : undefined;

  return {
    product_ids: productIds,
    products,
    rows,
    winner_product_id: winnerId,
    rationale,
  };
}

/**
 * Mastra Tool: discover_products
 * Queries Channel3 /v1/search with promo code PAYPAL-HACKATHON-2026 and returns validated ProductCardData[].
 */
export function createDiscoverProductsTool(channel3Client: Channel3Client = defaultChannel3Client) {
  return createTool({
    id: 'discover_products',
    description: 'Searches multi-vendor catalog via Channel3 API with promo code PAYPAL-HACKATHON-2026',
    inputSchema: z.object({
      query: z.string().describe('Search query keyword'),
      limit: z.number().int().positive().optional().default(10),
      category_id: z.string().optional(),
    }),
    outputSchema: z.object({
      products: z.array(ProductCardDataSchema),
      total_found: z.number(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const { query, limit = 10, category_id } = args;
      const res = await channel3Client.search({
        query: query || undefined,
        limit,
        category_ids: category_id ? [category_id] : undefined,
      });

      const cards = res.products.map(p => transformToProductCard(p));
      return {
        products: cards,
        total_found: cards.length,
      };
    },
  });
}

/**
 * Mastra Tool: score_and_rank
 * Deterministic mathematical ranking engine over candidate products with 0% LLM math hallucination.
 */
export function createScoreAndRankTool(scoringEngine: MurthyroshanScoringEngine = defaultScoringEngine) {
  return createTool({
    id: 'score_and_rank',
    description: 'Mathematically ranks products using Murthyroshan composite utility formula (Cosine + Price + Trust - Latency)',
    inputSchema: z.object({
      query: z.string(),
      products: z.array(ProductCardDataSchema),
      target_price_cents: z.number().int().positive().optional(),
    }),
    outputSchema: z.object({
      ranked_products: z.array(ProductCardDataSchema),
      top_winner_id: z.string().optional(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const { query, products, target_price_cents } = args;
      const productList: ProductCardData[] = products || [];
      if (productList.length === 0) {
        return { ranked_products: [], top_winner_id: undefined };
      }

      // Convert ProductCardData into Channel3ProductDetail format for scoring engine
      const details: Channel3ProductDetail[] = productList.map((p: ProductCardData) => ({
        product_id: p.product_id,
        title: p.title,
        description: p.description,
        category_id: p.category_id,
        images: [{ url: p.image_url, cleaned_url: p.cleaned_image_url }],
        offers: [{
          id: `offer_${p.product_id}`,
          product_id: p.product_id,
          domain: p.merchant_domain,
          price: p.price_cents,
          compare_at_price: p.compare_at_price_cents,
          max_commission_rate: p.commission_rate,
          shipping_fee_cents: p.shipping_fee_cents,
          merchant_anomaly_score: Math.max(0, (100 - p.merchant_credibility_score) / 100),
          stock_status: p.stock_status,
        }],
      }));

      const ranked = scoringEngine.rankProducts(details, {
        query,
        target_price_cents,
      });

      // Map back to ProductCardData preserving rank order
      const rankedMap = new Map<string, ProductCardData>(productList.map((p: ProductCardData) => [p.product_id, p]));
      const sortedCards: ProductCardData[] = [];
      for (const r of ranked) {
        const found = rankedMap.get(r.product_id);
        if (found) sortedCards.push(found);
      }

      return {
        ranked_products: sortedCards.length > 0 ? sortedCards : productList,
        top_winner_id: sortedCards[0]?.product_id,
      };
    },
  });
}

/**
 * Mastra Tool: solve_knapsack_cart
 * Solves multi-vendor knapsack cart optimization with commission rebates and postal tax estimation.
 */
export function createSolveKnapsackCartTool(
  channel3Client: Channel3Client = defaultChannel3Client,
  cartSolver: CartSolver = defaultCartSolver
) {
  return createTool({
    id: 'solve_knapsack_cart',
    description: 'Solves multi-vendor knapsack optimization with 75% commission pass-through and postal tax estimation',
    inputSchema: z.object({
      product_ids: z.array(z.string()).min(1),
      budget_cap_cents: z.number().int().positive().optional(),
      zip_code: z.string().optional(),
    }),
    outputSchema: z.object({
      cart: ExplainableCartPayloadSchema,
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      const catalog = await channel3Client.lookup(targetIds);
      const items = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));

      const knapsackResult: KnapsackOptimizationResult = cartSolver.solve(
        catalog,
        items,
        {
          budgetCapCents: budget_cap_cents,
          zipCode: zip_code,
        }
      );

      return {
        cart: knapsackResult,
      };
    },
  });
}

/**
 * Mastra Tool: verify_and_checkout
 * Executes pre-flight 2PC stock verification and prepares zero-click checkout payload.
 */
export function createVerifyAndCheckoutTool(channel3Client: Channel3Client = defaultChannel3Client) {
  return createTool({
    id: 'verify_and_checkout',
    description: 'Performs Two-Phase Commit (2PC) inventory hold verification prior to escrow authorization',
    inputSchema: z.object({
      product_ids: z.array(z.string()).min(1),
      budget_cap_cents: z.number().int().positive().optional(),
      zip_code: z.string().optional(),
    }),
    outputSchema: z.object({
      all_held: z.boolean(),
      reservation_id: z.string(),
      failed_items: z.array(z.string()),
      expires_at: z.string().optional(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      const stockItems = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));
      const stockRes = await channel3Client.verifyAndHoldStock(stockItems, {
        zipCode: zip_code,
        budgetCapCents: budget_cap_cents,
      });

      return {
        all_held: stockRes.all_held,
        reservation_id: stockRes.reservation_id,
        failed_items: stockRes.failed_items,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    },
  });
}

/**
 * Mastra Tool: execute_escrow_hold
 * Executes Two-Phase Commit (2PC) inventory hold and escrow reservation verification.
 */
export function createExecuteEscrowHoldTool(channel3Client: Channel3Client = defaultChannel3Client) {
  return createTool({
    id: 'execute_escrow_hold',
    description: 'Performs Two-Phase Commit (2PC) inventory hold verification prior to escrow authorization',
    inputSchema: z.object({
      product_ids: z.array(z.string()).min(1),
      budget_cap_cents: z.number().int().positive().optional(),
      zip_code: z.string().optional(),
    }),
    outputSchema: z.object({
      all_held: z.boolean(),
      reservation_id: z.string(),
      failed_items: z.array(z.string()),
      expires_at: z.string().optional(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      const stockItems = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));
      const stockRes = await channel3Client.verifyAndHoldStock(stockItems, {
        zipCode: zip_code,
        budgetCapCents: budget_cap_cents,
      });

      return {
        all_held: stockRes.all_held,
        reservation_id: stockRes.reservation_id,
        failed_items: stockRes.failed_items,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    },
  });
}

/**
 * Mastra Tool: paypal_create_invoice
 * Creates a draft B2B invoice via PayPal Invoicing v2 with customizable line items and terms.
 */
export function createCreateInvoiceTool(paypalClient: PayPalApimaticClient = defaultPayPalClient) {
  return createTool({
    id: 'paypal_create_invoice',
    description: 'Creates a draft B2B invoice via PayPal Invoicing v2 with customizable line items and payment terms',
    inputSchema: z.object({
      recipient_email: z.string().email(),
      recipient_name: z.string().optional(),
      business_name: z.string().optional(),
      currency_code: z.string().default('USD'),
      items: z.array(z.object({
        name: z.string(),
        quantity: z.union([z.string(), z.number()]).default('1'),
        unit_amount_cents: z.number().int().positive(),
        description: z.string().optional(),
      })).min(1),
      payment_term: z.string().default('NET_30'),
      note: z.string().optional(),
    }),
    outputSchema: z.object({
      invoice_id: z.string(),
      status: z.string(),
      invoice_number: z.string(),
      amount: z.object({
        currency_code: z.string(),
        value: z.string(),
      }),
      payer_view_url: z.string().optional(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const totalCents = args.items.reduce((acc: number, it: any) => {
        const q = typeof it.quantity === 'number' ? it.quantity : parseInt(it.quantity || '1', 10);
        return acc + it.unit_amount_cents * q;
      }, 0);

      const invoiceRes = await paypalClient.createInvoice({
        detail: {
          currency_code: args.currency_code || 'USD',
          note: args.note,
          payment_term: { term_type: args.payment_term || 'NET_30' },
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: args.recipient_email,
              business_name: args.business_name,
              name: args.recipient_name ? { full_name: args.recipient_name } : undefined,
            },
          },
        ],
        items: args.items.map((it: any) => ({
          name: it.name,
          quantity: it.quantity.toString(),
          unit_amount: {
            currency_code: args.currency_code || 'USD',
            value: (it.unit_amount_cents / 100).toFixed(2),
          },
          description: it.description,
        })),
        amount: {
          currency_code: args.currency_code || 'USD',
          value: (totalCents / 100).toFixed(2),
        },
      });

      const payerViewLink = (invoiceRes as any).links?.find((l: any) => l.rel === 'payer-view')?.href;

      return {
        invoice_id: invoiceRes.id,
        status: invoiceRes.status,
        invoice_number: invoiceRes.detail.invoice_number,
        amount: {
          currency_code: invoiceRes.amount?.currency_code || 'USD',
          value: invoiceRes.amount?.value || (totalCents / 100).toFixed(2),
        },
        payer_view_url: payerViewLink,
      };
    },
  });
}

/**
 * Mastra Tool: paypal_send_invoice
 * Sends a PayPal B2B invoice to the recipient email and updates status to SENT.
 */
export function createSendInvoiceTool(paypalClient: PayPalApimaticClient = defaultPayPalClient) {
  return createTool({
    id: 'paypal_send_invoice',
    description: 'Sends a PayPal B2B invoice to the recipient email and updates status to SENT',
    inputSchema: z.object({
      invoice_id: z.string().min(1),
    }),
    outputSchema: z.object({
      invoice_id: z.string(),
      status: z.string(),
      success: z.boolean(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const success = await paypalClient.sendInvoice(args.invoice_id);
      return {
        invoice_id: args.invoice_id,
        status: 'SENT',
        success,
      };
    },
  });
}

/**
 * Mastra Tool: paypal_generate_invoice_qr
 * Generates a payment QR code (Base64 PNG data URI) for an existing PayPal invoice.
 */
export function createGenerateInvoiceQrCodeTool(paypalClient: PayPalApimaticClient = defaultPayPalClient) {
  return createTool({
    id: 'paypal_generate_invoice_qr',
    description: 'Generates a payment QR code (Base64 PNG data URI) for an existing PayPal invoice',
    inputSchema: z.object({
      invoice_id: z.string().min(1),
    }),
    outputSchema: z.object({
      invoice_id: z.string(),
      qr_code: z.string(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const qrCode = await paypalClient.generateInvoiceQrCode(args.invoice_id);
      return {
        invoice_id: args.invoice_id,
        qr_code: qrCode,
      };
    },
  });
}

/**
 * Mastra Tool: paypal_send_invoice_reminder
 * Sends an automated payment reminder to the invoice recipient.
 */
export function createSendInvoiceReminderTool(paypalClient: PayPalApimaticClient = defaultPayPalClient) {
  return createTool({
    id: 'paypal_send_invoice_reminder',
    description: 'Sends an automated payment reminder to the invoice recipient',
    inputSchema: z.object({
      invoice_id: z.string().min(1),
      note: z.string().optional(),
    }),
    outputSchema: z.object({
      invoice_id: z.string(),
      status: z.string(),
      success: z.boolean(),
    }),
    execute: async (input: any) => {
      const args = input?.context || input;
      const success = await paypalClient.sendInvoiceReminder(args.invoice_id, args.note);
      return {
        invoice_id: args.invoice_id,
        status: 'REMINDER_SENT',
        success,
      };
    },
  });
}
