/**
 * apps/api-orchestrator/src/services/mastra-workflows.ts
 *
 * Production-ready Mastra Workflow DAG & Compensating Rollback Engine.
 *
 * Section 16 Production-Readiness & Security Audit:
 * 1. Modular DAG Step definitions with strict Zod input/output schemas.
 * 2. Per-step execution timeout wrappers (preventing hung agent runs).
 * 3. Two-Phase Commit (2PC) stock hold reservation & bulletproof compensating rollback
 *    if downstream DAG steps fail or time out.
 * 4. Error propagation and typed context handling across the commerce pipeline.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  ProductCardDataSchema,
  ExplainableCartPayloadSchema,
  ProductCardData,
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';
import {
  Channel3Client,
  Channel3ProductDetail,
  defaultChannel3Client,
} from './channel3.client.js';
import {
  MurthyroshanScoringEngine,
  defaultScoringEngine,
  assignProductBadges,
} from './scoring-engine.js';
import {
  CartSolver,
  defaultCartSolver,
} from './cart-solver.js';
import {
  StockReservationEngine,
  defaultStockReservationEngine,
} from './stock-reservation.js';
import {
  transformToProductCard,
} from './mastra-tools.js';
import {
  CommercePipelineInputSchema,
  CommercePipelineOutputSchema,
  CommercePipelineInput,
  CommercePipelineOutput,
} from './shopping-assistant.js';

const logger = createLogger('API:Services:AIWorkflows').child('MastraWorkflows');

export const StepExecutionTimeoutSchema = z.object({
  discoverTimeoutMs: z.number().int().positive().default(10000),
  scoreTimeoutMs: z.number().int().positive().default(5000),
  cartTimeoutMs: z.number().int().positive().default(5000),
  escrowTimeoutMs: z.number().int().positive().default(10000),
});

export type StepExecutionTimeoutConfig = z.infer<typeof StepExecutionTimeoutSchema>;

export const DEFAULT_STEP_TIMEOUTS: StepExecutionTimeoutConfig = {
  discoverTimeoutMs: 10000,
  scoreTimeoutMs: 5000,
  cartTimeoutMs: 5000,
  escrowTimeoutMs: 10000,
};

export class WorkflowStepTimeoutError extends Error {
  public stepId: string;
  public timeoutMs: number;

  constructor(stepId: string, timeoutMs: number) {
    super(`Workflow step '${stepId}' execution timed out after ${timeoutMs}ms`);
    this.name = 'WorkflowStepTimeoutError';
    this.stepId = stepId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Executes a step function wrapped with an enforced timeout.
 */
export async function withStepTimeout<T>(
  stepId: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  logger.debug(`[withStepTimeout] Initializing timeout guard for step '${stepId}' (${timeoutMs}ms)`);
  try {
    const result = await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          logger.warn(`[withStepTimeout] Step '${stepId}' exceeded execution timeout limit (${timeoutMs}ms)`);
          reject(new WorkflowStepTimeoutError(stepId, timeoutMs));
        }, timeoutMs);
        if (timer.unref) {
          timer.unref();
        }
      }),
    ]);
    logger.debug(`[withStepTimeout] Step '${stepId}' completed within timeout limit (${timeoutMs}ms)`);
    return result;
  } catch (error: any) {
    logger.error(`[withStepTimeout] Step '${stepId}' execution failed or timed out`, {
      stepId,
      timeoutMs,
      error: sanitizeForLogging(error),
      errorMessage: error?.message,
      stack: error?.stack,
    });
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export interface MastraWorkflowEngineOptions {
  channel3Client?: Channel3Client;
  scoringEngine?: MurthyroshanScoringEngine;
  cartSolver?: CartSolver;
  stockReservationEngine?: StockReservationEngine;
  timeouts?: Partial<StepExecutionTimeoutConfig>;
}

/**
 * MastraWorkflows: encapsulates the 4-step commerce DAG and compensating rollback handlers.
 */
export class MastraWorkflows {
  private channel3Client: Channel3Client;
  private scoringEngine: MurthyroshanScoringEngine;
  private cartSolver: CartSolver;
  private stockReservationEngine: StockReservationEngine;
  private timeouts: StepExecutionTimeoutConfig;

  constructor(options?: MastraWorkflowEngineOptions) {
    this.channel3Client = options?.channel3Client || defaultChannel3Client;
    this.scoringEngine = options?.scoringEngine || defaultScoringEngine;
    this.cartSolver = options?.cartSolver || defaultCartSolver;
    this.stockReservationEngine = options?.stockReservationEngine || defaultStockReservationEngine;
    this.timeouts = { ...DEFAULT_STEP_TIMEOUTS, ...(options?.timeouts || {}) };
    logger.info('[MastraWorkflows:init] Engine initialized with timeouts', {
      timeouts: this.timeouts,
      hasCustomChannel3: Boolean(options?.channel3Client),
      hasCustomScoring: Boolean(options?.scoringEngine),
      hasCustomCartSolver: Boolean(options?.cartSolver),
      hasCustomStockReservation: Boolean(options?.stockReservationEngine),
    });
  }

  /**
   * Compensating rollback for 2PC stock holds.
   * If a reservation was established during the DAG run and subsequent operations fail,
   * this safely rolls back the held inventory to prevent orphaned locks.
   */
  public rollbackHeldStock(reservationId: string, reason: string = 'DOWNSTREAM_DAG_STEP_FAILED'): boolean {
    logger.info(`[MastraWorkflows:rollbackHeldStock] Initiating 2PC compensating rollback for reservation: ${reservationId}`, {
      reservationId,
      reason,
    });
    try {
      const existing = this.stockReservationEngine.getReservation(reservationId);
      if (existing) {
        logger.debug(`[MastraWorkflows:rollbackHeldStock] Found existing reservation record in state: ${existing.state}`, {
          reservationId,
          state: existing.state,
          itemCount: existing.items?.length,
        });
        if (existing.state === 'PREPARED') {
          this.stockReservationEngine.abort(reservationId, reason);
          logger.info(`[MastraWorkflows:rollbackHeldStock] Successfully rolled back PREPARED reservation: ${reservationId}`);
          return true;
        } else {
          logger.warn(`[MastraWorkflows:rollbackHeldStock] Cannot rollback reservation in non-PREPARED state: ${existing.state}`, {
            reservationId,
            state: existing.state,
          });
          return false;
        }
      } else {
        logger.warn(`[MastraWorkflows:rollbackHeldStock] Reservation ${reservationId} not found in registry`);
        return false;
      }
    } catch (err: any) {
      logger.error(`[MastraWorkflows:rollbackHeldStock] Failed to execute compensating rollback for reservation ${reservationId}`, {
        reservationId,
        reason,
        error: sanitizeForLogging(err),
        stack: err?.stack,
      });
      return false;
    }
  }

  /**
   * Constructs the modular Mastra DAG workflow.
   */
  public buildDAG() {
    logger.debug('[MastraWorkflows:buildDAG] Constructing modular commerce DAG');

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
        logger.info('[Mastra DAG:discover_products] Commencing Step 1 execution', {
          query: inputData.query,
          message: inputData.message,
          productIdsCount: inputData.product_ids?.length ?? 0,
          budgetCapCents: inputData.budget_cap_cents,
          zipCode: inputData.zip_code,
        });
        return await withStepTimeout('discover_products', this.timeouts.discoverTimeoutMs, async () => {
          const trace = [...(inputData.thought_trace || [])];
          const query = inputData.query || inputData.message || '';
          trace.push(`[Mastra DAG: discover_products] Searching products for query "${query}"`);

          let products: ProductCardData[] = [];
          if (inputData.product_ids && inputData.product_ids.length > 0) {
            logger.debug(`[Mastra DAG:discover_products] Looking up explicit product IDs: ${inputData.product_ids.join(', ')}`);
            const details = await this.channel3Client.lookup(inputData.product_ids);
            products = details.map((p: Channel3ProductDetail) => transformToProductCard(p));
            logger.info(`[Mastra DAG:discover_products] Channel3 lookup returned ${products.length} product details`);
          } else {
            const limit = inputData.limit || 10;
            logger.debug(`[Mastra DAG:discover_products] Executing Channel3 vector search for query: "${query}" (limit: ${limit})`);
            const res = await this.channel3Client.search({
              query: query || undefined,
              limit,
            });
            products = res.products.map((p: Channel3ProductDetail) => transformToProductCard(p));
            logger.info(`[Mastra DAG:discover_products] Channel3 search returned ${products.length} matching products`);
          }

          trace.push(`[Mastra DAG: discover_products] Discovered ${products.length} products`);

          const output = {
            query,
            products,
            total_found: products.length,
            budget_cap_cents: inputData.budget_cap_cents,
            zip_code: inputData.zip_code,
            product_ids: inputData.product_ids,
            thought_trace: trace,
          };
          logger.info('[Mastra DAG:discover_products] Step 1 completed successfully', {
            totalFound: output.total_found,
            hasBudgetCap: Boolean(output.budget_cap_cents),
          });
          return output;
        });
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
        logger.info('[Mastra DAG:score_and_rank] Commencing Step 2 execution', {
          itemCount: inputData.products?.length ?? 0,
          budgetCapCents: inputData.budget_cap_cents,
          query: inputData.query,
        });
        return await withStepTimeout('score_and_rank', this.timeouts.scoreTimeoutMs, async () => {
          const trace = [...inputData.thought_trace];
          trace.push(`[Mastra DAG: score_and_rank] Deterministically scoring ${inputData.products.length} items`);

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

          logger.debug(`[Mastra DAG:score_and_rank] Scoring ${details.length} details against target budget ${inputData.budget_cap_cents ?? 'unbounded'}`);
          const rankedItems = this.scoringEngine.rankProducts(details, {
            query: inputData.query,
            target_price_cents: inputData.budget_cap_cents,
          });

          logger.debug(`[Mastra DAG:score_and_rank] Assigning badges to ${rankedItems.length} ranked items`);
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
          trace.push(`[Mastra DAG: score_and_rank] Winner: ${topWinnerId}`);

          logger.info('[Mastra DAG:score_and_rank] Step 2 completed successfully', {
            rankedCardsCount: rankedCards.length,
            topWinnerId,
          });

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
        });
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
        logger.info('[Mastra DAG:solve_knapsack_cart] Commencing Step 3 execution', {
          topWinnerId: inputData.top_winner_id,
          productIdsProvided: inputData.product_ids?.length ?? 0,
          budgetCapCents: inputData.budget_cap_cents,
          zipCode: inputData.zip_code,
        });
        return await withStepTimeout('solve_knapsack_cart', this.timeouts.cartTimeoutMs, async () => {
          const trace = [...inputData.thought_trace];
          trace.push(`[Mastra DAG: solve_knapsack_cart] Solving knapsack cart bundling`);

          let targetIds: string[] = inputData.product_ids || [];
          if (targetIds.length === 0) {
            if (inputData.top_winner_id) {
              logger.debug(`[Mastra DAG:solve_knapsack_cart] Using top winner ID as target product: ${inputData.top_winner_id}`);
              targetIds = [inputData.top_winner_id];
            } else if (inputData.ranked_products.length > 0) {
              logger.debug(`[Mastra DAG:solve_knapsack_cart] Using first ranked product as target: ${inputData.ranked_products[0].product_id}`);
              targetIds = [inputData.ranked_products[0].product_id];
            } else {
              logger.warn('[Mastra DAG:solve_knapsack_cart] No products available to target for knapsack solver');
            }
          }

          logger.debug(`[Mastra DAG:solve_knapsack_cart] Target product IDs: ${targetIds.join(', ')}`);
          const catalog = await this.channel3Client.lookup(targetIds);
          logger.info(`[Mastra DAG:solve_knapsack_cart] Lookup yielded ${catalog.length} catalog items for optimization`);

          const knapsack = this.cartSolver.solve(
            catalog,
            targetIds.map((pid: string) => ({ product_id: pid, quantity: 1 })),
            {
              budgetCapCents: inputData.budget_cap_cents,
              zipCode: inputData.zip_code,
            }
          );

          const validatedCart = ExplainableCartPayloadSchema.parse(knapsack);
          logger.info('[Mastra DAG:solve_knapsack_cart] Step 3 solved knapsack cart successfully', {
            targetIdsCount: targetIds.length,
            assignedMerchantsCount: validatedCart.assigned_merchants?.length ?? 0,
            netExpenditureCents: validatedCart.net_buyer_expenditure_cents,
            isWithinBudget: validatedCart.is_within_budget,
          });

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
        });
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
        logger.info('[Mastra DAG:execute_escrow_hold] Commencing Step 4 execution', {
          targetProductIds: inputData.target_product_ids,
          budgetCapCents: inputData.budget_cap_cents,
          zipCode: inputData.zip_code,
        });
        return await withStepTimeout('execute_escrow_hold', this.timeouts.escrowTimeoutMs, async () => {
          const trace = [...inputData.thought_trace];
          trace.push(`[Mastra DAG: execute_escrow_hold] Executing 2PC stock verification`);

          const holdItems = inputData.target_product_ids.map((pid: string) => ({ product_id: pid, quantity: 1 }));
          logger.debug(`[Mastra DAG:execute_escrow_hold] Verifying and holding stock for ${holdItems.length} items`);
          const stockRes = await this.channel3Client.verifyAndHoldStock(holdItems, {
            zipCode: inputData.zip_code,
            budgetCapCents: inputData.budget_cap_cents,
          });

          logger.info(`[Mastra DAG:execute_escrow_hold] Channel3 verifyAndHoldStock returned reservation: ${stockRes.reservation_id}`, {
            allHeld: stockRes.all_held,
            reservationId: stockRes.reservation_id,
          });

          // Register hold with StockReservationEngine to support 2PC rollback compensation
          if (stockRes.all_held) {
            try {
              logger.debug(`[Mastra DAG:execute_escrow_hold] Registering 2PC prepare hold for reservation: ${stockRes.reservation_id}`);
              this.stockReservationEngine.prepare(
                holdItems.map((i: any) => ({ productId: i.product_id, quantity: i.quantity })),
                { ttlMs: 15 * 60 * 1000 },
                stockRes.reservation_id
              );
              logger.info(`[Mastra DAG:execute_escrow_hold] StockReservationEngine prepared hold ${stockRes.reservation_id} with 15m TTL`);
            } catch (err: any) {
              logger.error(`[Mastra DAG:execute_escrow_hold] Error preparing stock reservation record for ${stockRes.reservation_id}`, {
                error: sanitizeForLogging(err),
                errorMessage: err?.message,
                stack: err?.stack,
              });
            }
          } else {
            logger.warn(`[Mastra DAG:execute_escrow_hold] Not all stock could be held for reservation ${stockRes.reservation_id}`);
          }

          trace.push(`[Mastra DAG: execute_escrow_hold] 2PC hold: ${stockRes.reservation_id}`);

          logger.info('[Mastra DAG:execute_escrow_hold] Step 4 completed successfully', {
            success: stockRes.all_held,
            reservationId: stockRes.reservation_id,
          });

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
            markdown: `2PC Reservation: ${stockRes.reservation_id}`,
            thought_trace: trace,
          };
        });
      },
    });

    logger.debug('[MastraWorkflows:buildDAG] Committing 4-stage pipeline DAG');
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

  /**
   * Executes the full pipeline with automatic 2PC compensating rollback.
   */
  public async executeWorkflow(input: CommercePipelineInput): Promise<CommercePipelineOutput> {
    logger.info('[MastraWorkflows:executeWorkflow] Starting workflow execution run', {
      query: input.query,
      message: input.message,
      budgetCapCents: input.budget_cap_cents,
      zipCode: input.zip_code,
    });
    const wf = this.buildDAG();
    const run = await wf.createRun();
    let reservationIdToRollback: string | undefined;

    try {
      const runResult = await run.start({ inputData: input });
      logger.info(`[MastraWorkflows:executeWorkflow] Workflow run settled with status: ${runResult.status}`);
      if (runResult.status !== 'success' || !runResult.result) {
        // Check if escrow step ran and holds stock before subsequent failure
        const escrowStepResult = runResult.steps ? (runResult.steps as any).execute_escrow_hold : undefined;
        if (escrowStepResult && escrowStepResult.output?.reservation_id) {
          reservationIdToRollback = escrowStepResult.output.reservation_id;
          logger.warn(`[MastraWorkflows:executeWorkflow] Escrow step held reservation ${reservationIdToRollback} prior to DAG failure`, {
            reservationIdToRollback,
          });
        }
        const error = (runResult as any).error || new Error(`Mastra DAG run failed with status: ${runResult.status}`);
        logger.error('[MastraWorkflows:executeWorkflow] DAG run status was not success', {
          status: runResult.status,
          error: sanitizeForLogging(error),
        });
        throw error;
      }
      logger.info('[MastraWorkflows:executeWorkflow] Workflow completed successfully with output action: BUY');
      return runResult.result as CommercePipelineOutput;
    } catch (err: any) {
      logger.error('[MastraWorkflows:executeWorkflow] Caught exception during workflow DAG run', {
        error: sanitizeForLogging(err),
        errorMessage: err?.message,
        stack: err?.stack,
        reservationIdToRollback,
      });
      if (reservationIdToRollback) {
        logger.info(`[MastraWorkflows:executeWorkflow] Executing compensating rollback for held stock: ${reservationIdToRollback}`);
        this.rollbackHeldStock(reservationIdToRollback, `DAG execution failed: ${err.message}`);
      } else {
        logger.debug('[MastraWorkflows:executeWorkflow] No active reservation ID required compensating rollback');
      }
      throw err;
    }
  }
}

export const defaultMastraWorkflows = new MastraWorkflows();
