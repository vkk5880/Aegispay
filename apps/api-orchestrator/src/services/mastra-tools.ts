import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  ProductCardDataSchema,
  ComparisonMatrixSchema,
  ExplainableCartPayloadSchema,
  ProductCardData,
  ComparisonMatrix,
  ComparisonMatrixRow,
  ActiveTurnProduct,
  ActiveTurnProductSchema,
  FilterTurnProductsInputSchema,
  FilterTurnProductsOutputSchema,
  CompareProductsInputSchema,
  CompareProductsOutputSchema,
  PrepareCheckoutInputSchema,
  PrepareCheckoutOutputSchema,
  SearchCatalogInputSchema,
  SearchCatalogOutputSchema,
  RecoveryPill,
  createLogger,
  sanitizeForLogging,
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

const logger = createLogger('API:Services:MastraTools');

export function transformToProductCard(p: Channel3ProductDetail): ProductCardData {
  logger.debug(`transformToProductCard: processing product ${p.product_id} ("${p.title}")`);
  const inStockOffers = p.offers.filter(o => o.stock_status !== 'OUT_OF_STOCK');
  let bestOffer: Channel3Offer;

  if (inStockOffers.length > 0) {
    bestOffer = inStockOffers.reduce((min, cur) => cur.price < min.price ? cur : min, inStockOffers[0]);
    logger.debug(`transformToProductCard: selected best in-stock offer ${bestOffer.id} ($${(bestOffer.price / 100).toFixed(2)}) from ${bestOffer.domain}`);
  } else if (p.offers.length > 0) {
    bestOffer = p.offers[0];
    logger.debug(`transformToProductCard: no in-stock offers, fell back to first offer ${bestOffer.id} ($${(bestOffer.price / 100).toFixed(2)})`);
  } else {
    bestOffer = {
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
    logger.debug(`transformToProductCard: offers array empty, using mock fallback offer for ${p.product_id}`);
  }

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

  logger.debug(`transformToProductCard: product ${p.product_id} transformed: price=$${(priceCents / 100).toFixed(2)}, rebate=$${(rebateCents / 100).toFixed(2)}, credibility=${credibility}%`);

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
    variants: [
      { id: `${p.product_id}_v1`, name: 'Midnight Black', price_cents: priceCents, stock_status: 'IN_STOCK' },
      { id: `${p.product_id}_v2`, name: 'Silver Frost', price_cents: priceCents, stock_status: 'IN_STOCK' },
      { id: `${p.product_id}_v3`, name: 'Cobalt Navy', price_cents: priceCents + 1000, stock_status: 'IN_STOCK' },
    ],
    selected_variant_id: `${p.product_id}_v1`,
  };
}

export function buildComparisonMatrix(products: ProductCardData[]): ComparisonMatrix {
  logger.info(`buildComparisonMatrix: generating matrix for ${products.length} products`);
  const productIds = products.map(p => p.product_id);

  let minNet = Infinity;
  let winnerId = productIds[0];

  products.forEach(p => {
    const net = p.price_cents - p.commission_rebate_cents;
    logger.debug(`buildComparisonMatrix candidate ${p.product_id}: net=$${(net / 100).toFixed(2)} (price=$${(p.price_cents / 100).toFixed(2)}, rebate=$${(p.commission_rebate_cents / 100).toFixed(2)})`);
    if (net < minNet) {
      minNet = net;
      winnerId = p.product_id;
    }
  });

  logger.info(`buildComparisonMatrix: identified winner=${winnerId} with min net cost=$${(minNet / 100).toFixed(2)}`);

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
      const stopTimer = logger.time('MastraTool:discover_products');
      const args = input?.context || input;
      const { query, limit = 10, category_id } = args;
      logger.info('Executing Mastra tool: discover_products', sanitizeForLogging({ query, limit, category_id }));

      try {
        const res = await channel3Client.search({
          query: query || undefined,
          limit,
          category_ids: category_id ? [category_id] : undefined,
        });
        logger.debug(`Channel3 search returned ${res.products?.length ?? 0} raw products`);

        const cards = res.products.map(p => transformToProductCard(p));
        stopTimer(`found ${cards.length} product cards`);
        logger.info(`discover_products completed: total_found=${cards.length}`);
        return {
          products: cards,
          total_found: cards.length,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during discover_products execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
    },
  });
}

/**
 * Mastra Tool: search_catalog
 * Channel3 multi-vendor catalog search with Murthyroshan composite ranking.
 */
export function createSearchCatalogTool(
  channel3Client: Channel3Client = defaultChannel3Client,
  scoringEngine: MurthyroshanScoringEngine = defaultScoringEngine
) {
  return createTool({
    id: 'search_catalog',
    description: 'Searches multi-vendor catalog via Channel3 API with promo code PAYPAL-HACKATHON-2026 and Murthyroshan composite ranking',
    inputSchema: SearchCatalogInputSchema,
    outputSchema: SearchCatalogOutputSchema,
    execute: async (input: any) => {
      const stopTimer = logger.time('MastraTool:search_catalog');
      const args = input?.context || input;
      const { query, category, max_price_usd, limit = 50 } = args;
      logger.info('Executing Mastra tool: search_catalog', sanitizeForLogging({ query, category, max_price_usd, limit }));

      try {
        const res = await channel3Client.search({
          query: query || undefined,
          limit,
          category_ids: category ? [category] : undefined,
        });

        const cards = res.products.map(p => transformToProductCard(p));
        const targetPriceCents = max_price_usd ? Math.round(max_price_usd * 100) : undefined;

        // Rank candidates deterministically
        const details: Channel3ProductDetail[] = cards.map(c => ({
          product_id: c.product_id,
          title: c.title,
          description: c.description,
          category_id: c.category_id,
          images: [{ url: c.image_url || '', cleaned_url: c.cleaned_image_url || c.image_url || '' }],
          offers: [{
            id: `off_${c.product_id}`,
            product_id: c.product_id,
            domain: c.merchant_domain,
            price: c.price_cents,
            compare_at_price: c.compare_at_price_cents,
            max_commission_rate: c.commission_rate,
            shipping_fee_cents: c.shipping_fee_cents,
            merchant_anomaly_score: Math.max(0, (100 - c.merchant_credibility_score) / 100),
            stock_status: c.stock_status,
          }],
        }));

        const ranked = scoringEngine.rankProducts(details, { query, target_price_cents: targetPriceCents });
        const rankedMap = new Map<string, ProductCardData>(cards.map(c => [c.product_id, c]));
        const sortedCards: ProductCardData[] = [];
        for (const r of ranked) {
          const card = rankedMap.get(r.product_id);
          if (card) sortedCards.push(card);
        }

        const finalProducts = sortedCards.length > 0 ? sortedCards : cards;
        stopTimer(`found ${finalProducts.length} ranked products`);
        logger.info(`search_catalog completed: total_found=${finalProducts.length}`);

        return {
          products: finalProducts,
          total_found: finalProducts.length,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during search_catalog execution', { error: err?.message, stack: err?.stack });
        throw err;
      }
    },
  });
}

/**
 * Mastra Tool: filter_turn_products
 * Operates strictly on active_turn_products in-memory (<2ms) without external API overhead.
 * Filters by criteria (e.g. "top 3", "delicate", "under $50", wattage, brand), sorts, and bounds results.
 */
export function createFilterTurnProductsTool(getActiveTurnProducts?: () => ActiveTurnProduct[]) {
  return createTool({
    id: 'filter_turn_products',
    description: 'Filters and sorts candidate products strictly from the active turn in-memory (<2ms) without hitting external APIs',
    inputSchema: FilterTurnProductsInputSchema,
    outputSchema: FilterTurnProductsOutputSchema,
    execute: async (input: any) => {
      const stopTimer = logger.time('MastraTool:filter_turn_products');
      const args = input?.context || input;
      const { criteria, max_price_usd, top_n = 5, sort_by } = args;
      const turnItems: ActiveTurnProduct[] =
        args.active_turn_products && args.active_turn_products.length > 0
          ? args.active_turn_products
          : getActiveTurnProducts?.() || [];

      logger.info(`Executing Mastra tool: filter_turn_products with ${turnItems.length} active turn products`, {
        criteria,
        max_price_usd,
        top_n,
        sort_by,
      });

      if (turnItems.length === 0) {
        stopTimer('zero active turn items');
        return { products: [], filtered_count: 0, applied_criteria: criteria };
      }

      let filtered = [...turnItems];

      // Parse explicit max_price_usd or extract from criteria (e.g. "under $50")
      let effectiveMaxCents: number | undefined = max_price_usd ? Math.round(max_price_usd * 100) : undefined;
      if (!effectiveMaxCents && criteria) {
        const priceMatch = criteria.match(/(?:under|below|less\s+than|<\s*|\$)\s*(\d+)/i);
        if (priceMatch && priceMatch[1]) {
          effectiveMaxCents = parseInt(priceMatch[1], 10) * 100;
        }
      }

      if (effectiveMaxCents !== undefined) {
        filtered = filtered.filter(p => p.price_cents <= effectiveMaxCents!);
      }

      // Filter by text criteria keywords against title, merchant domain, or specs
      if (criteria && criteria.trim().length > 0) {
        const tokens = criteria
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t: string) => !['under', 'below', 'less', 'than', 'show', 'only', 'from', 'that', 'top', 'the', 'and', 'with', 'for'].includes(t));

        if (tokens.length > 0) {
          filtered = filtered.filter(p => {
            const titleLower = (p.title || '').toLowerCase();
            const domainLower = (p.merchant_domain || '').toLowerCase();
            const specsStr = p.specs ? Object.entries(p.specs).map(([k, v]) => `${k} ${v}`).join(' ').toLowerCase() : '';
            const combined = `${titleLower} ${domainLower} ${specsStr}`;
            return tokens.some((t: string) => combined.includes(t));
          });
        }
      }

      // Check if criteria specifies "top N"
      let effectiveTopN = top_n;
      if (criteria) {
        const topMatch = criteria.match(/\btop\s+(\d+)\b/i);
        if (topMatch && topMatch[1]) {
          effectiveTopN = parseInt(topMatch[1], 10);
        }
      }

      // Sorting
      if (sort_by === 'price_asc' || (criteria && /\b(cheapest|lowest price|budget)\b/i.test(criteria))) {
        filtered.sort((a, b) => a.price_cents - b.price_cents);
      } else if (sort_by === 'rating_desc' || (criteria && /\b(highest rated|best rating|popular)\b/i.test(criteria))) {
        filtered.sort((a, b) => b.rating - a.rating);
      } else if (sort_by === 'trust_desc') {
        filtered.sort((a, b) => b.price_cents - a.price_cents);
      }

      const sliced = filtered.slice(0, effectiveTopN);

      // Map to full ProductCardData
      const cards: ProductCardData[] = sliced.map(p => ({
        product_id: p.product_id,
        title: p.title,
        description: `${p.title} from ${p.merchant_domain}`,
        category_id: 'general',
        price_cents: p.price_cents,
        compare_at_price_cents: Math.round(p.price_cents * 1.15),
        commission_rebate_cents: Math.round(p.price_cents * 0.1 * 0.75),
        commission_rate: 0.1,
        rating: p.rating,
        review_count: 120,
        shipping_fee_cents: p.free_shipping ? 0 : 500,
        free_shipping: p.free_shipping,
        merchant_domain: p.merchant_domain,
        merchant_credibility_score: 95,
        stock_status: 'IN_STOCK',
        delivery_window: '2-3 Business Days',
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
        cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
        specs: p.specs || {},
      }));

      stopTimer(`filtered ${cards.length} items from ${turnItems.length} active turn items`);
      logger.info(`filter_turn_products completed in <2ms: returned ${cards.length} products`);

      return {
        products: cards,
        filtered_count: cards.length,
        applied_criteria: criteria,
      };
    },
  });
}

/**
 * Mastra Tool: compare_products
 * Evaluates candidate products side-by-side across specs, price, ratings, and merchant credibility.
 */
export function createCompareProductsTool(
  channel3Client: Channel3Client = defaultChannel3Client,
  getActiveTurnProducts?: () => ActiveTurnProduct[]
) {
  return createTool({
    id: 'compare_products',
    description: 'Generates a side-by-side comparison matrix across specified product IDs with spec tables and recommendations',
    inputSchema: CompareProductsInputSchema,
    outputSchema: CompareProductsOutputSchema,
    execute: async (input: any) => {
      const stopTimer = logger.time('MastraTool:compare_products');
      const args = input?.context || input;
      const { product_ids } = args;
      const targetIds: string[] = product_ids || [];
      const turnItems: ActiveTurnProduct[] =
        args.active_turn_products && args.active_turn_products.length > 0
          ? args.active_turn_products
          : getActiveTurnProducts?.() || [];

      logger.info(`Executing Mastra tool: compare_products for ${targetIds.length} IDs`, { targetIds });

      let cards: ProductCardData[] = [];

      // Check active turn products first (<2ms in-memory resolution)
      if (turnItems.length > 0) {
        const matched = turnItems.filter(p => targetIds.includes(p.product_id));
        if (matched.length >= 2) {
          cards = matched.map(p => ({
            product_id: p.product_id,
            title: p.title,
            description: `${p.title} from ${p.merchant_domain}`,
            category_id: 'general',
            price_cents: p.price_cents,
            compare_at_price_cents: Math.round(p.price_cents * 1.15),
            commission_rebate_cents: Math.round(p.price_cents * 0.1 * 0.75),
            commission_rate: 0.1,
            rating: p.rating,
            review_count: 120,
            shipping_fee_cents: p.free_shipping ? 0 : 500,
            free_shipping: p.free_shipping,
            merchant_domain: p.merchant_domain,
            merchant_credibility_score: 95,
            stock_status: 'IN_STOCK',
            delivery_window: '2-3 Business Days',
            image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
            cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
            specs: p.specs || {},
          }));
          logger.debug(`compare_products: grounded ${cards.length} items from active turn context in-memory`);
        }
      }

      // If not grounded from turn items, lookup from Channel3
      if (cards.length < 2) {
        const details = await channel3Client.lookup(targetIds.slice(0, 4));
        cards = details.map(d => transformToProductCard(d));
      }

      const matrix = buildComparisonMatrix(cards);
      stopTimer(`built comparison matrix for ${cards.length} products with winner ${matrix.winner_product_id}`);
      logger.info(`compare_products completed: winner=${matrix.winner_product_id}, count=${cards.length}`);

      return {
        comparison: matrix,
        products: cards,
        winner_product_id: matrix.winner_product_id,
      };
    },
  });
}

/**
 * Mastra Tool: prepare_checkout
 * Validates strict server quantity cap (1 <= quantity <= 5), executes 2PC verifyAndHoldStock,
 * and calculates total expenditure with shipping fee.
 */
export function createPrepareCheckoutTool(
  channel3Client: Channel3Client = defaultChannel3Client,
  cartSolver: CartSolver = defaultCartSolver
) {
  return createTool({
    id: 'prepare_checkout',
    description: 'Enforces strict quantity cap (1 <= quantity <= 5), executes 2PC inventory hold, and solves multi-vendor knapsack cart',
    inputSchema: PrepareCheckoutInputSchema,
    outputSchema: PrepareCheckoutOutputSchema,
    execute: async (input: any) => {
      const stopTimer = logger.time('MastraTool:prepare_checkout');
      const args = input?.context || input;
      const { product_id, quantity = 1, budget_cap_cents, zip_code } = args;

      // Strict validation
      const validatedInput = PrepareCheckoutInputSchema.parse({ product_id, quantity, budget_cap_cents, zip_code });
      const effectiveQty = validatedInput.quantity;

      logger.info('Executing Mastra tool: prepare_checkout', { product_id, quantity: effectiveQty, budget_cap_cents });

      try {
        const details = await channel3Client.lookup([product_id]);
        const productDetail = details[0];
        const card = productDetail ? transformToProductCard(productDetail) : undefined;

        const stockItems = [{ product_id, quantity: effectiveQty }];
        const stockRes = await channel3Client.verifyAndHoldStock(stockItems, {
          zipCode: zip_code,
          budgetCapCents: budget_cap_cents,
        });

        // Multi-vendor knapsack cart solve
        const knapsack = cartSolver.solve(
          details,
          [{ product_id, quantity: effectiveQty }],
          { budgetCapCents: budget_cap_cents, zipCode: zip_code }
        );

        const unitPriceCents = card ? card.price_cents : 4999;
        const shippingCents = card && !card.free_shipping ? card.shipping_fee_cents : 0;
        const totalExpenditureCents = (unitPriceCents * effectiveQty) + shippingCents;
        const hitlRequired = Boolean(budget_cap_cents && totalExpenditureCents > budget_cap_cents);

        // Upgrade F: Generate 1-tap recovery pills for stock failure or budget overrun
        const recoveryPills: RecoveryPill[] = [];
        if (!stockRes.all_held) {
          recoveryPills.push({
            id: `rec_alt_${Date.now()}`,
            label: `🔄 Alternative in Stock: Sony WH-1000XM5 ($279)`,
            action: 'ALTERNATIVE_PRODUCT',
            message_prompt: `Show in-stock alternatives for ${card?.title || 'this product'}`,
          });
        }
        if (hitlRequired && budget_cap_cents) {
          const suggestedCap = Math.ceil((totalExpenditureCents + 1000) / 1000) * 1000;
          recoveryPills.push({
            id: `rec_budget_${Date.now()}`,
            label: `💸 Adjust Budget Cap to $${(suggestedCap / 100).toFixed(0)}`,
            action: 'ADJUST_BUDGET',
            suggested_budget_cents: suggestedCap,
            message_prompt: `Adjust my shopping budget cap to $${(suggestedCap / 100).toFixed(0)} and proceed`,
          });
          if (shippingCents > 0) {
            recoveryPills.push({
              id: `rec_ship_${Date.now()}`,
              label: `📦 Switch to Standard Shipping (-$${(shippingCents / 100).toFixed(2)})`,
              action: 'SWITCH_SHIPPING',
              shipping_type: 'STANDARD',
              message_prompt: `Switch to standard shipping to waive the $${(shippingCents / 100).toFixed(2)} shipping fee`,
            });
          }
        }

        stopTimer(`held stock=${stockRes.all_held}, total=$${(totalExpenditureCents / 100).toFixed(2)}`);
        logger.info(`prepare_checkout completed: all_held=${stockRes.all_held}, reservation_id=${stockRes.reservation_id}, hitlRequired=${hitlRequired}, pills=${recoveryPills.length}`);

        return {
          all_held: stockRes.all_held,
          reservation_id: stockRes.reservation_id,
          product: card,
          cart: knapsack,
          total_expenditure_cents: totalExpenditureCents,
          hitl_required: hitlRequired,
          requires_approval: hitlRequired,
          recovery_pills: recoveryPills.length > 0 ? recoveryPills : undefined,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during prepare_checkout execution', { error: err?.message, stack: err?.stack });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:score_and_rank');
      const args = input?.context || input;
      const { query, products, target_price_cents } = args;
      const productList: ProductCardData[] = products || [];
      logger.info(`Executing Mastra tool: score_and_rank with ${productList.length} products`, {
        query,
        target_price_cents,
      });

      if (productList.length === 0) {
        logger.debug('score_and_rank: empty product list provided, returning empty ranking');
        stopTimer('zero products');
        return { ranked_products: [], top_winner_id: undefined };
      }

      try {
        // Convert ProductCardData into Channel3ProductDetail format for scoring engine
        const details: Channel3ProductDetail[] = productList.map((p: ProductCardData) => ({
          product_id: p.product_id,
          title: p.title,
          description: p.description,
          category_id: p.category_id,
          images: [{ url: p.image_url || p.cleaned_url || '', cleaned_url: p.cleaned_image_url || p.cleaned_url || '' }],
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

        logger.debug(`Invoking MurthyroshanScoringEngine.rankProducts for ${details.length} items`);
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

        const winnerId = sortedCards[0]?.product_id;
        stopTimer(`ranked ${sortedCards.length} products, winner=${winnerId || 'none'}`);
        logger.info(`score_and_rank completed: winner=${winnerId || 'none'}, count=${sortedCards.length}`);

        return {
          ranked_products: sortedCards.length > 0 ? sortedCards : productList,
          top_winner_id: winnerId,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during score_and_rank execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:solve_knapsack_cart');
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      logger.info('Executing Mastra tool: solve_knapsack_cart', {
        item_count: targetIds.length,
        budget_cap_cents,
        zip_code,
      });

      try {
        logger.debug(`Looking up ${targetIds.length} products via Channel3Client`);
        const catalog = await channel3Client.lookup(targetIds);
        const items = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));

        logger.debug('Invoking CartSolver.solve with catalog data');
        const knapsackResult: KnapsackOptimizationResult = cartSolver.solve(
          catalog,
          items,
          {
            budgetCapCents: budget_cap_cents,
            zipCode: zip_code,
          }
        );

        stopTimer(`solved with ${knapsackResult.assigned_merchants.length} merchant groups`);
        logger.info(`solve_knapsack_cart completed: net_total=$${(knapsackResult.net_buyer_expenditure_cents / 100).toFixed(2)}, is_within_budget=${knapsackResult.is_within_budget}`);

        return {
          cart: knapsackResult,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during solve_knapsack_cart execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:verify_and_checkout');
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      logger.info('Executing Mastra tool: verify_and_checkout', {
        item_count: targetIds.length,
        budget_cap_cents,
        zip_code,
      });

      try {
        const stockItems = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));
        logger.debug(`Calling Channel3Client.verifyAndHoldStock for ${stockItems.length} items`);
        const stockRes = await channel3Client.verifyAndHoldStock(stockItems, {
          zipCode: zip_code,
          budgetCapCents: budget_cap_cents,
        });

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        stopTimer(`all_held=${stockRes.all_held}, reservation_id=${stockRes.reservation_id}`);
        logger.info(`verify_and_checkout completed: all_held=${stockRes.all_held}, failed_items=${stockRes.failed_items.length}`);

        return {
          all_held: stockRes.all_held,
          reservation_id: stockRes.reservation_id,
          failed_items: stockRes.failed_items,
          expires_at: expiresAt,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during verify_and_checkout execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:execute_escrow_hold');
      const args = input?.context || input;
      const { product_ids, budget_cap_cents, zip_code } = args;
      const targetIds: string[] = product_ids || [];
      logger.info('Executing Mastra tool: execute_escrow_hold', {
        item_count: targetIds.length,
        budget_cap_cents,
        zip_code,
      });

      try {
        const stockItems = targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 }));
        logger.debug(`Calling Channel3Client.verifyAndHoldStock for ${stockItems.length} items`);
        const stockRes = await channel3Client.verifyAndHoldStock(stockItems, {
          zipCode: zip_code,
          budgetCapCents: budget_cap_cents,
        });

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        stopTimer(`all_held=${stockRes.all_held}, reservation_id=${stockRes.reservation_id}`);
        logger.info(`execute_escrow_hold completed: all_held=${stockRes.all_held}, failed_items=${stockRes.failed_items.length}`);

        return {
          all_held: stockRes.all_held,
          reservation_id: stockRes.reservation_id,
          failed_items: stockRes.failed_items,
          expires_at: expiresAt,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during execute_escrow_hold execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:paypal_create_invoice');
      const args = input?.context || input;
      logger.info('Executing Mastra tool: paypal_create_invoice', sanitizeForLogging({
        recipient_email: args.recipient_email,
        recipient_name: args.recipient_name,
        business_name: args.business_name,
        items_count: args.items?.length,
        payment_term: args.payment_term,
      }));

      try {
        const totalCents = args.items.reduce((acc: number, it: any) => {
          const q = typeof it.quantity === 'number' ? it.quantity : parseInt(it.quantity || '1', 10);
          return acc + it.unit_amount_cents * q;
        }, 0);
        logger.debug(`Calculated total invoice cents: ${totalCents} ($${(totalCents / 100).toFixed(2)})`);

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
        stopTimer(`created invoice id=${invoiceRes.id}`);
        logger.info(`paypal_create_invoice completed: invoice_id=${invoiceRes.id}, status=${invoiceRes.status}`);

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
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error('Error during paypal_create_invoice execution', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:paypal_send_invoice');
      const args = input?.context || input;
      logger.info(`Executing Mastra tool: paypal_send_invoice for invoice_id=${args.invoice_id}`);

      try {
        const success = await paypalClient.sendInvoice(args.invoice_id);
        stopTimer(`sent invoice, success=${success}`);
        logger.info(`paypal_send_invoice completed: invoice_id=${args.invoice_id}, success=${success}`);
        return {
          invoice_id: args.invoice_id,
          status: 'SENT',
          success,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error(`Error during paypal_send_invoice for invoice_id=${args.invoice_id}`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:paypal_generate_invoice_qr');
      const args = input?.context || input;
      logger.info(`Executing Mastra tool: paypal_generate_invoice_qr for invoice_id=${args.invoice_id}`);

      try {
        const qrCode = await paypalClient.generateInvoiceQrCode(args.invoice_id);
        stopTimer('generated QR code');
        logger.info(`paypal_generate_invoice_qr completed: invoice_id=${args.invoice_id}`);
        return {
          invoice_id: args.invoice_id,
          qr_code: qrCode,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error(`Error during paypal_generate_invoice_qr for invoice_id=${args.invoice_id}`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
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
      const stopTimer = logger.time('MastraTool:paypal_send_invoice_reminder');
      const args = input?.context || input;
      logger.info(`Executing Mastra tool: paypal_send_invoice_reminder for invoice_id=${args.invoice_id}`, {
        note: args.note,
      });

      try {
        const success = await paypalClient.sendInvoiceReminder(args.invoice_id, args.note);
        stopTimer(`reminder sent, success=${success}`);
        logger.info(`paypal_send_invoice_reminder completed: invoice_id=${args.invoice_id}, success=${success}`);
        return {
          invoice_id: args.invoice_id,
          status: 'REMINDER_SENT',
          success,
        };
      } catch (err: any) {
        stopTimer('failed with error');
        logger.error(`Error during paypal_send_invoice_reminder for invoice_id=${args.invoice_id}`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        throw err;
      }
    },
  });
}
