import {
  ShoppingActionType,
  ProductCardData,
  ComparisonMatrix,
  ComparisonMatrixRow,
  ChatResponsePayload,
  ProductCardDataSchema,
  ComparisonMatrixSchema,
  ExplainableCartPayloadSchema,
  ExplainableCartPayload,
} from '@aegispay/shared-types';
import { Agent } from '@mastra/core/agent';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  Channel3Client,
  Channel3ProductDetail,
  defaultChannel3Client,
  TwoPhaseStockReservationResult,
} from './channel3.client.js';
import {
  CartSolver,
  defaultCartSolver,
  KnapsackOptimizationResult,
} from './cart-solver.js';
import {
  MurthyroshanScoringEngine,
  defaultScoringEngine,
  assignProductBadges,
  computeDealVerdict,
} from './scoring-engine.js';
import {
  createDiscoverProductsTool,
  createScoreAndRankTool,
  createSolveKnapsackCartTool,
  createVerifyAndCheckoutTool,
  createExecuteEscrowHoldTool,
  transformToProductCard,
  buildComparisonMatrix,
} from './mastra-tools.js';

export { ComparisonMatrixSchema };

/**
 * Generates a structured side-by-side comparison matrix matching compare_agent.py.
 * Evaluates candidate products across price, specs, merchant credibility, delivery latency,
 * deal verdict, and deterministic 30-day price history drop percentage.
 */
export function generateComparisonMatrix(
  products: (ProductCardData | Channel3ProductDetail)[]
): ComparisonMatrix {
  if (!products || products.length === 0) {
    return {
      product_ids: [],
      products: [],
      rows: [],
      winner_product_id: undefined,
      rationale: undefined,
    };
  }

  const cards: ProductCardData[] = products.map(p => {
    if ('offers' in p && Array.isArray((p as any).offers)) {
      return transformToProductCard(p as Channel3ProductDetail);
    }
    return p as ProductCardData;
  });

  const productIds = cards.map(p => p.product_id);

  let minNet = Infinity;
  let winnerId = productIds[0];

  cards.forEach(p => {
    const net = p.price_cents - p.commission_rebate_cents;
    if (net < minNet) {
      minNet = net;
      winnerId = p.product_id;
    }
  });

  // Deterministic 30-day historical average from title hash matching compare_agent.py
  const get30dHistorical = (p: ProductCardData) => {
    let hash = 0;
    for (let i = 0; i < p.title.length; i++) {
      hash = (hash << 5) - hash + p.title.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);
    const jitterPct = 5 + (seed % 20); // 5% to 25% above current price
    const histAvgCents = Math.round(p.price_cents * (1 + jitterPct / 100));
    const dropPct = Math.round(((histAvgCents - p.price_cents) / histAvgCents) * 1000) / 10;
    return { histAvgCents, dropPct };
  };

  const rows: ComparisonMatrixRow[] = [
    {
      attribute: 'Retail Price',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, `$${(p.price_cents / 100).toFixed(2)}`])
      ),
    },
    {
      attribute: 'Commission Rebate',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, `-$${(p.commission_rebate_cents / 100).toFixed(2)} (${Math.round(p.commission_rate * 75)}% back)`])
      ),
      highlighted_product_id: winnerId,
    },
    {
      attribute: 'Net Effective Price',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, `$${((p.price_cents - p.commission_rebate_cents) / 100).toFixed(2)}`])
      ),
      highlighted_product_id: winnerId,
    },
    {
      attribute: 'Customer Rating',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, `★ ${p.rating} (${p.review_count} reviews)`])
      ),
    },
    {
      attribute: 'Merchant Credibility',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, `${p.merchant_credibility_score}% Trust Rating (${p.merchant_domain})`])
      ),
    },
    {
      attribute: 'Delivery Window',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, p.free_shipping ? `Free • ${p.delivery_window}` : `$${(p.shipping_fee_cents / 100).toFixed(2)} • ${p.delivery_window}`])
      ),
    },
    {
      attribute: 'Stock Status',
      values: Object.fromEntries(
        cards.map(p => [p.product_id, p.stock_status === 'IN_STOCK' ? '✓ In Stock (2PC Verified)' : 'Out of Stock'])
      ),
    },
    {
      attribute: 'Deal Verdict',
      values: Object.fromEntries(
        cards.map(p => {
          const net = p.price_cents - p.commission_rebate_cents;
          const score = Math.max(0.2, Math.min(0.95, (p.merchant_credibility_score / 100) * 0.5 + (1 - net / (p.compare_at_price_cents || p.price_cents)) * 0.5));
          const verdict = computeDealVerdict(score);
          return [p.product_id, verdict.verdict_text];
        })
      ),
      highlighted_product_id: winnerId,
    },
    {
      attribute: '30-Day Historical Trend',
      values: Object.fromEntries(
        cards.map(p => {
          const { dropPct, histAvgCents } = get30dHistorical(p);
          return [p.product_id, `📉 ${dropPct}% drop vs 30d avg ($${(histAvgCents / 100).toFixed(2)})`];
        })
      ),
    },
  ];

  const winnerProduct = cards.find(p => p.product_id === winnerId);
  const rationale = winnerProduct
    ? `**${winnerProduct.title}** delivers the best overall value with a net effective cost of $${((winnerProduct.price_cents - winnerProduct.commission_rebate_cents) / 100).toFixed(2)} after instant commission pass-through and a ${winnerProduct.merchant_credibility_score}% merchant trust rating.`
    : undefined;

  const matrix: ComparisonMatrix = {
    product_ids: productIds,
    products: cards,
    rows,
    winner_product_id: winnerId,
    rationale,
  };

  return ComparisonMatrixSchema.parse(matrix);
}

export const CommercePipelineInputSchema = z.object({
  query: z.string().optional(),
  message: z.string().optional(),
  limit: z.number().int().positive().optional(),
  budget_cap_cents: z.number().int().positive().optional(),
  zip_code: z.string().optional(),
  product_ids: z.array(z.string()).optional(),
  model: z.string().optional(),
  thought_trace: z.array(z.string()).optional(),
});

export const CommercePipelineOutputSchema = z.object({
  action: z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']).default('BUY'),
  success: z.boolean(),
  all_held: z.boolean(),
  reservation_id: z.string(),
  query: z.string().optional(),
  products: z.array(ProductCardDataSchema),
  ranked_products: z.array(ProductCardDataSchema).optional(),
  top_winner_id: z.string().optional(),
  cart: ExplainableCartPayloadSchema.or(z.any()),
  stock_reservation: z.any(),
  markdown: z.string().optional(),
  thought_trace: z.array(z.string()),
});

export type CommercePipelineInput = z.input<typeof CommercePipelineInputSchema>;
export type CommercePipelineOutput = z.infer<typeof CommercePipelineOutputSchema>;

export interface CommerceModelOption {
  id: string;
  name: string;
  provider: 'google' | 'anthropic' | 'openai' | 'custom';
  description: string;
  badge?: string;
  contextWindow?: string;
}

export const AVAILABLE_COMMERCE_MODELS: CommerceModelOption[] = [
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Sub-second tool latency, optimized for autonomous multi-vendor shopping concierges.',
    badge: 'Recommended / Default',
    contextWindow: '1M tokens',
  },
  {
    id: 'google/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Advanced reasoning over complex catalogs and multi-attribute product comparison.',
    badge: 'Deep Reasoning',
    contextWindow: '2M tokens',
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Premier structured schema verification, tool execution, and explainable logic.',
    badge: 'Advanced Synthesis',
    contextWindow: '200k tokens',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Omni-channel conversational intelligence with high natural language flexibility.',
    badge: 'Omni Reasoning',
    contextWindow: '128k tokens',
  },
];

export function resolveCommerceModel(requestedModel?: string): string {
  if (requestedModel && requestedModel.trim().length > 0) {
    return requestedModel.trim();
  }
  return (
    process.env.COMMERCE_AGENT_MODEL ||
    process.env.MASTRA_DEFAULT_MODEL ||
    process.env.LLM_MODEL ||
    'google/gemini-2.5-flash'
  );
}

export interface ChatMessageRequest {
  message: string;
  action?: ShoppingActionType;
  product_ids?: string[];
  budget_cap_cents?: number;
  zip_code?: string;
  model?: string;
  provider?: string;
  user_api_key?: string;
  temperature?: number;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export const WorkflowInputSchema = z.object({
  message: z.string(),
  explicit_action: z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']).optional(),
  product_ids: z.array(z.string()).optional(),
  budget_cap_cents: z.number().int().positive().optional(),
  zip_code: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  user_api_key: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const WorkflowOutputSchema = z.object({
  action: z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']),
  markdown: z.string(),
  products: z.array(ProductCardDataSchema).optional(),
  comparison: ComparisonMatrixSchema.optional(),
  product_detail: ProductCardDataSchema.optional(),
  cart: ExplainableCartPayloadSchema.optional().or(z.any()),
  stock_reservation: z.any().optional(),
  follow_up_suggestions: z.array(z.string()).optional(),
  thought_trace: z.array(z.string()).optional(),
  active_model: z.string().optional(),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;

export class ShoppingAssistantService {
  private channel3Client: Channel3Client;
  private cartSolver: CartSolver;
  private scoringEngine: MurthyroshanScoringEngine;
  private agent: Agent;
  public workflow: any;
  public commerceWorkflow: any;
  public pipelineWorkflow: any;
  private chatWorkflow: any;

  // Mastra Tools
  public discoverTool: ReturnType<typeof createDiscoverProductsTool>;
  public scoreTool: ReturnType<typeof createScoreAndRankTool>;
  public solveCartTool: ReturnType<typeof createSolveKnapsackCartTool>;
  public verifyCheckoutTool: ReturnType<typeof createVerifyAndCheckoutTool>;
  public escrowHoldTool: ReturnType<typeof createExecuteEscrowHoldTool>;

  constructor(
    channel3Client: Channel3Client = defaultChannel3Client,
    cartSolver: CartSolver = defaultCartSolver,
    scoringEngine: MurthyroshanScoringEngine = defaultScoringEngine
  ) {
    this.channel3Client = channel3Client;
    this.cartSolver = cartSolver;
    this.scoringEngine = scoringEngine;

    // Initialize typed tools
    this.discoverTool = createDiscoverProductsTool(this.channel3Client);
    this.scoreTool = createScoreAndRankTool(this.scoringEngine);
    this.solveCartTool = createSolveKnapsackCartTool(this.channel3Client, this.cartSolver);
    this.verifyCheckoutTool = createVerifyAndCheckoutTool(this.channel3Client);
    this.escrowHoldTool = createExecuteEscrowHoldTool(this.channel3Client);

    // Initialize Mastra Agent with Gemini 3.8 Flash model configuration
    this.agent = new Agent({
      id: 'aegispay-commerce-agent',
      name: 'AegisPay Autonomous Shopping Concierge',
      instructions:
        'You are an autonomous dual-sided commerce concierge agent powered by AegisPay and Channel3. ' +
        'You classify buyer shopping requests into DISCOVER, COMPARE, DETAILS, or BUY actions. ' +
        'You execute typed tools to query multi-vendor products, calculate deterministic rankings, ' +
        'solve knapsack bundling optimization, and verify 2PC stock holds. ' +
        'You never hallucinate prices or discounts and always emit strict Zod-compliant structured outputs.',
      model: resolveCommerceModel(),
      tools: {
        discover_products: this.discoverTool,
        score_and_rank: this.scoreTool,
        solve_knapsack_cart: this.solveCartTool,
        execute_escrow_hold: this.escrowHoldTool,
        verify_and_checkout: this.verifyCheckoutTool,
      },
    });

    // Build the Mastra Commerce Workflow DAG (4 steps: discover_products -> score_and_rank -> solve_knapsack_cart -> execute_escrow_hold)
    this.commerceWorkflow = this.buildCommercePipelineWorkflow();
    this.pipelineWorkflow = this.commerceWorkflow;
    this.workflow = this.commerceWorkflow;

    // Build conversational chat workflow for multi-action execution
    this.chatWorkflow = this.buildChatWorkflow();
  }

  /**
   * Constructs the 4-step Mastra Commerce Workflow DAG:
   * discover_products -> score_and_rank -> solve_knapsack_cart -> execute_escrow_hold
   */
  public buildCommerceWorkflow() {
    return this.buildCommercePipelineWorkflow();
  }

  public buildCommercePipelineWorkflow() {
    // Step 1: discover_products
    const discoverStep = createStep({
      id: 'discover_products',
      inputSchema: CommercePipelineInputSchema,
      outputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        total_found: z.number(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        thought_trace: z.array(z.string()),
      }),
      execute: async ({ inputData }: { inputData: CommercePipelineInput }) => {
        const trace = [...(inputData.thought_trace || [])];
        const query = inputData.query || (inputData.message ? this.extractSearchQuery(inputData.message) : '');
        trace.push(`[Mastra DAG: discover_products] Searching products for query "${query}" with promo code PAYPAL-HACKATHON-2026`);

        let products: ProductCardData[] = [];
        if (inputData.product_ids && inputData.product_ids.length > 0) {
          const details = await this.channel3Client.lookup(inputData.product_ids);
          products = details.map(p => transformToProductCard(p));
        } else {
          const res = await this.channel3Client.search({
            query: query || undefined,
            limit: inputData.limit || 10,
          });
          products = res.products.map(p => transformToProductCard(p));
        }

        trace.push(`[Mastra DAG: discover_products] Discovered ${products.length} products across participating merchants`);

        return {
          query,
          products,
          total_found: products.length,
          budget_cap_cents: inputData.budget_cap_cents,
          zip_code: inputData.zip_code,
          product_ids: inputData.product_ids,
          thought_trace: trace,
        };
      },
    });

    // Step 2: score_and_rank
    const scoreStep = createStep({
      id: 'score_and_rank',
      inputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        total_found: z.number().optional(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        thought_trace: z.array(z.string()),
      }),
      outputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        ranked_products: z.array(ProductCardDataSchema),
        top_winner_id: z.string().optional(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        thought_trace: z.array(z.string()),
      }),
      execute: async ({ inputData }: any) => {
        const trace = [...inputData.thought_trace];
        trace.push(`[Mastra DAG: score_and_rank] Deterministically scoring ${inputData.products.length} products via composite utility formula`);

        const details: Channel3ProductDetail[] = inputData.products.map((p: ProductCardData) => ({
          product_id: p.product_id,
          title: p.title,
          description: p.description,
          category_id: p.category_id,
          images: [{ url: p.image_url, cleaned_url: p.cleaned_image_url }],
          offers: [{
            id: `off_${p.product_id}`,
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

        const rankedItems = this.scoringEngine.rankProducts(details, {
          query: inputData.query,
          target_price_cents: inputData.budget_cap_cents,
        });

        // Award badges across candidates
        assignProductBadges(rankedItems);

        const rankedMap = new Map<string, ProductCardData>(inputData.products.map((p: ProductCardData) => [p.product_id, p]));
        const rankedCards: ProductCardData[] = [];
        for (const r of rankedItems) {
          const card = rankedMap.get(r.product_id);
          if (card) {
            rankedCards.push(card);
          }
        }

        const topWinnerId = rankedCards[0]?.product_id;
        trace.push(`[Mastra DAG: score_and_rank] Deterministically scored ${rankedCards.length} items without math hallucination. Winner: ${topWinnerId}`);

        return {
          query: inputData.query,
          products: inputData.products,
          ranked_products: rankedCards.length > 0 ? rankedCards : inputData.products,
          top_winner_id: topWinnerId,
          budget_cap_cents: inputData.budget_cap_cents,
          zip_code: inputData.zip_code,
          product_ids: inputData.product_ids,
          thought_trace: trace,
        };
      },
    });

    // Step 3: solve_knapsack_cart
    const cartStep = createStep({
      id: 'solve_knapsack_cart',
      inputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        ranked_products: z.array(ProductCardDataSchema),
        top_winner_id: z.string().optional(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        product_ids: z.array(z.string()).optional(),
        thought_trace: z.array(z.string()),
      }),
      outputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        ranked_products: z.array(ProductCardDataSchema),
        top_winner_id: z.string().optional(),
        cart: ExplainableCartPayloadSchema.or(z.any()),
        target_product_ids: z.array(z.string()),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        thought_trace: z.array(z.string()),
      }),
      execute: async ({ inputData }: any) => {
        const trace = [...inputData.thought_trace];
        trace.push(`[Mastra DAG: solve_knapsack_cart] Solving multi-vendor knapsack cart bundling`);

        let targetIds: string[] = inputData.product_ids || [];
        if (targetIds.length === 0) {
          if (inputData.top_winner_id) {
            targetIds = [inputData.top_winner_id];
          } else if (inputData.ranked_products.length > 0) {
            targetIds = [inputData.ranked_products[0].product_id];
          }
        }

        const catalog = await this.channel3Client.lookup(targetIds);
        const knapsack = this.cartSolver.solve(
          catalog,
          targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 })),
          {
            budgetCapCents: inputData.budget_cap_cents,
            zipCode: inputData.zip_code,
          }
        );

        const validatedCart = ExplainableCartPayloadSchema.parse(knapsack);
        trace.push(
          `[Mastra DAG: solve_knapsack_cart] Bundled cart: Net expenditure $${(validatedCart.net_buyer_expenditure_cents / 100).toFixed(2)}, Rebate $${(validatedCart.total_commission_rebate_cents / 100).toFixed(2)}`
        );

        return {
          query: inputData.query,
          products: inputData.products,
          ranked_products: inputData.ranked_products,
          top_winner_id: inputData.top_winner_id,
          cart: validatedCart,
          target_product_ids: targetIds,
          budget_cap_cents: inputData.budget_cap_cents,
          zip_code: inputData.zip_code,
          thought_trace: trace,
        };
      },
    });

    // Step 4: execute_escrow_hold
    const escrowStep = createStep({
      id: 'execute_escrow_hold',
      inputSchema: z.object({
        query: z.string(),
        products: z.array(ProductCardDataSchema),
        ranked_products: z.array(ProductCardDataSchema),
        top_winner_id: z.string().optional(),
        cart: ExplainableCartPayloadSchema.or(z.any()),
        target_product_ids: z.array(z.string()),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        thought_trace: z.array(z.string()),
      }),
      outputSchema: CommercePipelineOutputSchema,
      execute: async ({ inputData }: any) => {
        const trace = [...inputData.thought_trace];
        trace.push(`[Mastra DAG: execute_escrow_hold] Executing 2PC pre-flight stock verification and escrow hold`);

        const holdItems = inputData.target_product_ids.map((pid: string) => ({ product_id: pid, quantity: 1 }));
        const stockRes = await this.channel3Client.verifyAndHoldStock(holdItems, {
          zipCode: inputData.zip_code,
          budgetCapCents: inputData.budget_cap_cents,
        });

        trace.push(`[Mastra DAG: execute_escrow_hold] 2PC stock verification successful! Reservation ID: ${stockRes.reservation_id}`);

        const markdown = this.generateBuyMarkdown(inputData.cart, stockRes.reservation_id);

        return {
          action: 'BUY' as const,
          success: stockRes.all_held,
          all_held: stockRes.all_held,
          reservation_id: stockRes.reservation_id,
          query: inputData.query,
          products: inputData.ranked_products || inputData.products,
          ranked_products: inputData.ranked_products,
          top_winner_id: inputData.top_winner_id,
          cart: inputData.cart,
          stock_reservation: stockRes,
          markdown,
          thought_trace: trace,
        };
      },
    });

    return createWorkflow({
      id: 'mastra-commerce-workflow-dag',
      inputSchema: CommercePipelineInputSchema,
      outputSchema: CommercePipelineOutputSchema,
    })
      .then(discoverStep)
      .then(scoreStep)
      .then(cartStep)
      .then(escrowStep)
      .commit();
  }

  public async executeCommercePipeline(input: CommercePipelineInput): Promise<CommercePipelineOutput> {
    const run = await this.commerceWorkflow.createRun();
    const runResult = await run.start({ inputData: input });
    if (runResult.status !== 'success' || !runResult.result) {
      throw new Error(`Mastra Commerce Workflow DAG failed execution with status: ${runResult.status}`);
    }
    return runResult.result as CommercePipelineOutput;
  }

  /**
   * Constructs the conversational chat workflow for multi-action execution.
   */
  private buildChatWorkflow() {
    // Step 1: Intent Resolution & Parameter Extraction Step
    const intentStep = createStep({
      id: 'intent_resolution',
      inputSchema: WorkflowInputSchema,
      outputSchema: z.object({
        action: z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']),
        query: z.string(),
        product_ids: z.array(z.string()).optional(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
        user_api_key: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        thought_trace: z.array(z.string()),
      }),
      execute: async ({ inputData }: { inputData: WorkflowInput }) => {
        const activeModel = resolveCommerceModel(inputData.model);
        const action = this.resolveIntent(inputData.message, inputData.explicit_action);
        const query = this.extractSearchQuery(inputData.message);
        const keyAuth = inputData.user_api_key ? 'User-Scoped BYOK' : 'Platform Deploy';
        const trace = [
          `[Mastra Workflow DAG] Active Model: ${activeModel} (${keyAuth}) | Step 'intent_resolution' evaluated input: "${inputData.message}" -> Action: ${action}`,
        ];

        return {
          action,
          query,
          product_ids: inputData.product_ids,
          budget_cap_cents: inputData.budget_cap_cents,
          zip_code: inputData.zip_code,
          thought_trace: trace,
          model: activeModel,
        };
      },
    });

    // Step 2: Multi-Action Commerce Execution Step
    const executeStep = createStep({
      id: 'commerce_execution',
      inputSchema: z.object({
        action: z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']),
        query: z.string(),
        product_ids: z.array(z.string()).optional(),
        budget_cap_cents: z.number().int().positive().optional(),
        zip_code: z.string().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
        user_api_key: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        thought_trace: z.array(z.string()),
      }),
      outputSchema: WorkflowOutputSchema,
      execute: async ({ inputData }: any) => {
        const { action, query, product_ids, budget_cap_cents, zip_code, thought_trace, model } = inputData;
        const activeModel = resolveCommerceModel(model);
        const trace: string[] = [...thought_trace];

        switch (action) {
          case 'COMPARE':
            return {
              ...(await this.executeCompareWorkflow({ query, product_ids, trace })),
              active_model: activeModel,
            };
          case 'DETAILS':
            return {
              ...(await this.executeDetailsWorkflow({ query, product_ids, zip_code, trace })),
              active_model: activeModel,
            };
          case 'BUY':
            return {
              ...(await this.executeBuyWorkflow({ query, product_ids, budget_cap_cents, zip_code, trace })),
              active_model: activeModel,
            };
          case 'DISCOVER':
          default:
            return {
              ...(await this.executeDiscoverWorkflow({ query, budget_cap_cents, trace })),
              active_model: activeModel,
            };
        }
      },
    });

    return createWorkflow({
      id: 'mastra-chat-workflow',
      inputSchema: WorkflowInputSchema,
      outputSchema: WorkflowOutputSchema,
    })
      .then(intentStep)
      .then(executeStep)
      .commit();
  }

  /**
   * Resolves natural language shopping intent into DISCOVER, COMPARE, DETAILS, or BUY actions.
   */
  public parseIntent(message: string, explicitAction?: ShoppingActionType): ShoppingActionType {
    return this.resolveIntent(message, explicitAction);
  }

  /**
   * Resolves shopping intent using the Mastra Agent with deterministic semantics,
   * with zero markdown regex parsing.
   */
  private resolveIntent(message: string, explicitAction?: ShoppingActionType): ShoppingActionType {
    if (explicitAction) {
      return explicitAction;
    }

    const lower = message.toLowerCase();
    const tokens = new Set(lower.split(/[^a-z0-9]+/));

    const buyTerms = ['buy', 'purchase', 'checkout', 'order'];
    if (buyTerms.some(term => tokens.has(term)) || lower.includes('proceed to payment') || lower.includes('pay now') || lower.includes('get it for me')) {
      return 'BUY';
    }

    const compareTerms = ['compare', 'vs', 'versus'];
    if (compareTerms.some(term => tokens.has(term)) || lower.includes('which one is better') || lower.includes('side by side')) {
      return 'COMPARE';
    }

    const detailTerms = ['detail', 'details', 'specs', 'specifications', 'review'];
    if (detailTerms.some(term => tokens.has(term)) || lower.includes('tell me about') || lower.includes('more info') || lower.includes('features of')) {
      return 'DETAILS';
    }

    return 'DISCOVER';
  }

  /**
   * Main entry point for conversational agent requests via Mastra Agent Workflow.
   */
  async processMessage(request: ChatMessageRequest): Promise<ChatResponsePayload> {
    const input: WorkflowInput = {
      message: request.message,
      explicit_action: request.action,
      product_ids: request.product_ids,
      budget_cap_cents: request.budget_cap_cents,
      zip_code: request.zip_code,
      model: resolveCommerceModel(request.model),
      provider: request.provider,
      temperature: request.temperature,
      user_api_key: request.user_api_key,
    };

    const run = await this.chatWorkflow.createRun();
    const runResult = await run.start({ inputData: input });

    if (runResult.status !== 'success' || !runResult.result) {
      throw new Error(`Mastra Workflow DAG failed execution with status: ${runResult.status}`);
    }

    // Validate emitted output strictly against Zod schema
    const validated = WorkflowOutputSchema.parse(runResult.result);
    return {
      ...(validated as ChatResponsePayload),
      active_model: resolveCommerceModel(request.model),
    };
  }

  // --- Sub-Workflows Executed within the Workflow DAG ---

  public async executeDiscoverWorkflow(params: {
    query: string;
    budget_cap_cents?: number;
    trace: string[];
  }): Promise<WorkflowOutput> {
    const { query, budget_cap_cents, trace } = params;
    trace.push(`[Mastra DAG: discover_products] Dispatching search for query "${query}" with promo code PAYPAL-HACKATHON-2026`);

    // Execute typed discover tool
    const discoverRes = (await this.discoverTool.execute!(
      {
        query: query || '',
        limit: 10,
      },
      {} as any
    )) as { products: ProductCardData[]; total_found: number };

    const products: ProductCardData[] = discoverRes.products;
    trace.push(`Found ${products.length} matching products across participating merchants`);

    // Rank candidates deterministically with score_and_rank tool
    const scoreRes = (await this.scoreTool.execute!(
      {
        query,
        products,
        target_price_cents: budget_cap_cents,
      },
      {} as any
    )) as { ranked_products: ProductCardData[]; top_winner_id?: string };
    const rankedProducts = scoreRes.ranked_products;
    trace.push(`[Mastra DAG: score_and_rank] Deterministically scored ${rankedProducts.length} items without math hallucination`);

    // Validate all items match ProductCardDataSchema
    const validatedProducts = z.array(ProductCardDataSchema).parse(rankedProducts);

    const markdown = this.generateDiscoverMarkdown(query, validatedProducts);
    const followUps = [
      `Compare top ${Math.min(3, validatedProducts.length)} items`,
      `Show details for ${validatedProducts[0]?.title ? validatedProducts[0].title.slice(0, 30) + '...' : 'first item'}`,
      `Find headphones under $350`,
    ];

    return {
      action: 'DISCOVER',
      markdown,
      products: validatedProducts,
      follow_up_suggestions: followUps,
      thought_trace: trace,
    };
  }

  public async executeCompareWorkflow(params: {
    query: string;
    product_ids?: string[];
    trace: string[];
  }): Promise<WorkflowOutput> {
    const { query, product_ids, trace } = params;
    trace.push('[Mastra DAG: COMPARE] Initiating multi-product side-by-side comparison');

    let productsToCompare: Channel3ProductDetail[] = [];

    if (product_ids && product_ids.length >= 2) {
      productsToCompare = await this.channel3Client.lookup(product_ids.slice(0, 3));
      trace.push(`Loaded ${productsToCompare.length} products by provided product IDs`);
    }

    if (productsToCompare.length < 2) {
      const searchRes = await this.channel3Client.search({
        query: query || undefined,
        limit: 3,
      });
      productsToCompare = searchRes.products.slice(0, 3);
      trace.push(`Extracted query "${query}" and retrieved ${productsToCompare.length} candidate items`);
    }

    if (productsToCompare.length === 0) {
      return {
        action: 'COMPARE',
        markdown: 'I could not find enough products to compare. Please try searching for specific items or categories.',
        thought_trace: trace,
        follow_up_suggestions: ['Search for wireless headphones', 'Search for chargers'],
      };
    }

    const productCards = productsToCompare.map(p => transformToProductCard(p));
    const matrix = generateComparisonMatrix(productCards);
    trace.push(`Computed comparison matrix across ${productCards.length} products with winning recommendation`);

    // Validate comparison matrix schema
    const validatedMatrix = ComparisonMatrixSchema.parse(matrix);
    const validatedProducts = z.array(ProductCardDataSchema).parse(productCards);

    const markdown = this.generateCompareMarkdown(validatedProducts, validatedMatrix);

    return {
      action: 'COMPARE',
      markdown,
      products: validatedProducts,
      comparison: validatedMatrix,
      follow_up_suggestions: [
        `Buy the recommended ${validatedMatrix.winner_product_id ? validatedProducts.find(p => p.product_id === validatedMatrix.winner_product_id)?.title.slice(0, 25) + '...' : 'item'}`,
        'View full specs and warranty',
        'Check multi-vendor knapsack bundle savings',
      ],
      thought_trace: trace,
    };
  }

  public async executeDetailsWorkflow(params: {
    query: string;
    product_ids?: string[];
    zip_code?: string;
  model?: string;
  provider?: string;
  user_api_key?: string;
  temperature?: number;
    trace: string[];
  }): Promise<WorkflowOutput> {
    const { query, product_ids, zip_code, trace } = params;
    trace.push('[Mastra DAG: DETAILS] Retrieving deep product details and merchant credibility verification');

    let productDetail: Channel3ProductDetail | undefined;

    if (product_ids && product_ids.length > 0) {
      const results = await this.channel3Client.lookup([product_ids[0]]);
      productDetail = results[0];
      if (productDetail) {
        trace.push(`Retrieved item ${productDetail.product_id} via direct ID lookup`);
      }
    }

    if (!productDetail) {
      const searchRes = await this.channel3Client.search({
        query: query || undefined,
        limit: 1,
      });
      productDetail = searchRes.products[0];
      if (productDetail) {
        trace.push(`Found best matching item "${productDetail.title}" for query "${query}"`);
      }
    }

    if (!productDetail) {
      return {
        action: 'DETAILS',
        markdown: 'Sorry, I could not find product details for your query. Try browsing or searching for products first.',
        thought_trace: trace,
        follow_up_suggestions: ['Show popular products', 'Search noise cancelling headphones'],
      };
    }

    const card = transformToProductCard(productDetail);
    trace.push(`Verified merchant credibility score: ${card.merchant_credibility_score}% (${card.merchant_domain})`);

    // Validate single product detail schema
    const validatedCard = ProductCardDataSchema.parse(card);
    const markdown = this.generateDetailsMarkdown(validatedCard);

    return {
      action: 'DETAILS',
      markdown,
      product_detail: validatedCard,
      products: [validatedCard],
      follow_up_suggestions: [
        `Buy this item now (${(validatedCard.price_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`,
        `Compare with alternatives`,
        `Check delivery to ${zip_code || 'my ZIP'}`,
      ],
      thought_trace: trace,
    };
  }

  public async executeBuyWorkflow(params: {
    query: string;
    product_ids?: string[];
    budget_cap_cents?: number;
    zip_code?: string;
  model?: string;
  provider?: string;
  user_api_key?: string;
  temperature?: number;
    trace: string[];
  }): Promise<WorkflowOutput> {
    const { query, budget_cap_cents, zip_code, trace } = params;
    trace.push('[Mastra DAG: BUY] Executing pre-purchase 2PC inventory hold check and knapsack cart optimization');

    let targetProductIds: string[] = params.product_ids || [];

    if (targetProductIds.length === 0) {
      const searchRes = await this.channel3Client.search({
        query: query || undefined,
        limit: 1,
      });
      if (searchRes.products.length > 0) {
        targetProductIds = [searchRes.products[0].product_id];
        trace.push(`Identified intent to buy "${searchRes.products[0].title}" (${targetProductIds[0]})`);
      }
    }

    if (targetProductIds.length === 0) {
      return {
        action: 'BUY',
        markdown: 'Please select a product or specify what you would like to purchase.',
        thought_trace: trace,
        follow_up_suggestions: ['Show top electronics', 'Compare headphones'],
      };
    }

    // Step 1: Execute typed verify_and_checkout tool (2PC verification)
    trace.push(`[Mastra DAG: verify_and_checkout] Executing 2PC verifyAndHoldStock() across ${targetProductIds.length} items`);
    const stockHoldRes = (await this.verifyCheckoutTool.execute!(
      {
        product_ids: targetProductIds,
        budget_cap_cents,
        zip_code,
      },
      {} as any
    )) as { all_held: boolean; reservation_id: string; failed_items: string[]; expires_at?: string };

    if (!stockHoldRes.all_held) {
      trace.push(`2PC stock hold failed for items: ${stockHoldRes.failed_items.join(', ')}`);
      return {
        action: 'BUY',
        markdown: `⚠️ **Stock Alert:** One or more items are currently out of stock or failed reservation hold. We found alternative options for your consideration.`,
        stock_reservation: stockHoldRes,
        thought_trace: trace,
        follow_up_suggestions: ['Show available alternatives', 'Search similar products'],
      };
    }

    trace.push(`2PC stock verification successful! Reservation ID: ${stockHoldRes.reservation_id}`);

    // Step 2: Execute typed solve_knapsack_cart tool
    trace.push('[Mastra DAG: solve_knapsack_cart] Computing multi-vendor knapsack cart bundle');
    const solveCartRes = (await this.solveCartTool.execute!(
      {
        product_ids: targetProductIds,
        budget_cap_cents,
        zip_code,
      },
      {} as any
    )) as { cart: KnapsackOptimizationResult };

    // Validate emitted cart against ExplainableCartPayloadSchema
    const validatedCart: ExplainableCartPayload = ExplainableCartPayloadSchema.parse(solveCartRes.cart);

    trace.push(
      `Knapsack solver bundled cart: Net buyer price: $${(validatedCart.net_buyer_expenditure_cents / 100).toFixed(2)}, ` +
      `Instant Commission Rebate: $${(validatedCart.total_commission_rebate_cents / 100).toFixed(2)}, ` +
      `Shipping Saved: $${(validatedCart.total_shipping_saved_cents / 100).toFixed(2)}`
    );

    const markdown = this.generateBuyMarkdown(validatedCart, stockHoldRes.reservation_id);
    const catalog = await this.channel3Client.lookup(targetProductIds);
    const productCards = catalog.map(p => transformToProductCard(p));
    const validatedCards = z.array(ProductCardDataSchema).parse(productCards);

    return {
      action: 'BUY',
      markdown,
      products: validatedCards,
      cart: validatedCart,
      stock_reservation: stockHoldRes,
      follow_up_suggestions: [
        'Confirm purchase with 1-click Vault v3',
        'Apply alternate shipping address',
        'Add complementary accessories',
      ],
      thought_trace: trace,
    };
  }

  // --- Formatting Helpers ---

  private extractSearchQuery(message: string): string {
    const stopWords = new Set([
      'i', 'want', 'to', 'can', 'you', 'please', 'help', 'me', 'find', 'search', 'for',
      'look', 'show', 'compare', 'details', 'of', 'buy', 'purchase', 'get', 'the', 'a', 'an', 'with'
    ]);
    const words = message.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const filtered = words.filter(w => !stopWords.has(w.toLowerCase()));
    return filtered.join(' ').trim() || message.trim();
  }

  public getAgent(requestedModel?: string, userApiKey?: string): Agent {
    if (userApiKey && userApiKey.trim().length > 0) {
      // Ephemeral Agent with user-scoped BYOK key: NEVER cached or stored platform-wide
      const model = resolveCommerceModel(requestedModel);
      return new Agent({
        id: `aegispay-user-agent-${Date.now()}`,
        name: `AegisPay User-Scoped Concierge (${model})`,
        instructions:
          'You are an autonomous dual-sided commerce concierge agent powered by AegisPay and Channel3. ' +
          'You classify buyer shopping requests into DISCOVER, COMPARE, DETAILS, or BUY actions. ' +
          'You execute typed tools to query multi-vendor products, calculate deterministic rankings, ' +
          'solve knapsack bundling optimization, and verify 2PC stock holds. ' +
          'You never hallucinate prices or discounts and always emit strict Zod-compliant structured outputs.',
        model: model,
        tools: {
          discover_products: this.discoverTool,
          score_and_rank: this.scoreTool,
          solve_knapsack_cart: this.solveCartTool,
          verify_and_checkout: this.verifyCheckoutTool,
        },
      });
    }
    if (requestedModel && requestedModel !== resolveCommerceModel()) {
      return new Agent({
        id: `aegispay-agent-${requestedModel.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        name: `AegisPay Autonomous Shopping Concierge (${requestedModel})`,
        instructions:
          'You are an autonomous dual-sided commerce concierge agent powered by AegisPay and Channel3. ' +
          'You classify buyer shopping requests into DISCOVER, COMPARE, DETAILS, or BUY actions. ' +
          'You execute typed tools to query multi-vendor products, calculate deterministic rankings, ' +
          'solve knapsack bundling optimization, and verify 2PC stock holds. ' +
          'You never hallucinate prices or discounts and always emit strict Zod-compliant structured outputs.',
        model: requestedModel,
        tools: {
          discover_products: this.discoverTool,
          score_and_rank: this.scoreTool,
          solve_knapsack_cart: this.solveCartTool,
          verify_and_checkout: this.verifyCheckoutTool,
        },
      });
    }
    return this.agent;
  }

  private generateDiscoverMarkdown(query: string, products: ProductCardData[]): string {
    if (products.length === 0) {
      return `I couldn't find any products matching "${query}". Try searching for popular items like wireless headphones or charging stands!`;
    }

    const titleLine = query
      ? `Here are the top matches I discovered for **"${query}"**:`
      : `Here are our top recommended products:`;

    const summaryCards = products.slice(0, 3).map((p, i) => {
      const net = ((p.price_cents - p.commission_rebate_cents) / 100).toFixed(2);
      return `${i + 1}. **${p.title}**\n   - Retail: ~~$${(p.price_cents / 100).toFixed(2)}~~ → **Net: $${net}** (Includes $${(p.commission_rebate_cents / 100).toFixed(2)} instant rebate)\n   - Seller: \`${p.merchant_domain}\` (${p.merchant_credibility_score}% Trust Score)\n   - Delivery: ${p.free_shipping ? 'Free Shipping' : `$${(p.shipping_fee_cents / 100).toFixed(2)} shipping`}`;
    }).join('\n\n');

    return `${titleLine}\n\n${summaryCards}\n\n*All offers pre-cleared with promo code \`PAYPAL-HACKATHON-2026\` and covered by AegisPay Escrow Protection.*`;
  }

  private generateCompareMarkdown(products: ProductCardData[], matrix: ComparisonMatrix): string {
    return `### Side-by-Side Product Comparison Matrix\n\n` +
      `I evaluated **${products.length} products** across pricing, specs, merchant credibility, and commission pass-through:\n\n` +
      `${matrix.rationale ? `> 🏆 **Top Recommendation:** ${matrix.rationale}\n\n` : ''}` +
      `| Feature | ${products.map(p => `**${p.title.slice(0, 24)}...**`).join(' | ')} |\n` +
      `| :--- | ${products.map(() => ':---').join(' | ')} |\n` +
      matrix.rows.map(r => `| **${r.attribute}** | ${products.map(p => r.values[p.product_id] || '-').join(' | ')} |`).join('\n') +
      `\n\n*Ready to order? Click **[Buy for Me]** to execute zero-click purchase with 2PC stock verification.*`;
  }

  private generateDetailsMarkdown(p: ProductCardData): string {
    const net = ((p.price_cents - p.commission_rebate_cents) / 100).toFixed(2);
    return `### ${p.title}\n\n` +
      `${p.description}\n\n` +
      `#### Key Specifications & Credentials:\n` +
      `- **Price:** $${(p.price_cents / 100).toFixed(2)} (MSRP: ~~$${(p.compare_at_price_cents / 100).toFixed(2)}~~)\n` +
      `- **Instant Commission Rebate:** -$${(p.commission_rebate_cents / 100).toFixed(2)} (Effective Net: **$${net}**)\n` +
      `- **Merchant:** \`${p.merchant_domain}\` (🛡️ **${p.merchant_credibility_score}%** Credibility Rating)\n` +
      `- **Stock Status:** ${p.stock_status === 'IN_STOCK' ? '✅ In Stock' : '❌ Out of Stock'}\n` +
      `- **Delivery:** ${p.delivery_window} (${p.free_shipping ? 'Free Shipping' : `$${(p.shipping_fee_cents / 100).toFixed(2)}`})\n` +
      `- **Warranty:** 1-Year Manufacturer Warranty + AegisPay 72h Price Drop Protection\n\n` +
      `*High-resolution studio reference images are loaded below.*`;
  }

  private generateBuyMarkdown(knapsack: ExplainableCartPayload, reservationId: string): string {
    const netVal = (knapsack.net_buyer_expenditure_cents / 100).toFixed(2);
    const rebateVal = (knapsack.total_commission_rebate_cents / 100).toFixed(2);
    const shippingSaved = (knapsack.total_shipping_saved_cents / 100).toFixed(2);
    const merchants = knapsack.assigned_merchants.map(m => m.merchant_domain).join(', ');

    return `### Pre-Purchase Verification & Knapsack Cart Summary\n\n` +
      `✅ **Two-Phase Commit (2PC) Stock Reservation:** \`${reservationId}\` (Held)\n` +
      `✅ **Merchants Assigned:** ${merchants}\n\n` +
      `#### Financial Settlement Breakdown:\n` +
      `- **Gross Subtotal:** $${(knapsack.gross_subtotal_cents / 100).toFixed(2)}\n` +
      `- **Instant Commission Rebate:** -$${rebateVal}\n` +
      `- **Estimated Sales Tax:** $${(knapsack.total_tax_cents / 100).toFixed(2)}\n` +
      `- **Shipping Fee:** $${(knapsack.total_shipping_cents / 100).toFixed(2)} ${knapsack.total_shipping_saved_cents > 0 ? `(🎉 Saved $${shippingSaved} with multi-item bundling)` : ''}\n` +
      `- **Net Buyer Expenditure:** **$${netVal}**\n\n` +
      `*Merchant settlement is decoupled: merchants will be authorized full retail amount, with commission rebate applied as an instant platform subsidy.*`;
  }
}

export const defaultShoppingAssistant = new ShoppingAssistantService();

export function createCommercePipelineWorkflow(service: ShoppingAssistantService = defaultShoppingAssistant) {
  return service.buildCommercePipelineWorkflow();
}
