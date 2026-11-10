import { Render } from '@renderinc/sdk';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:RenderWorkflowClient');

export interface WorkflowDispatchResult {
  flowRunId: string;
  status: 'QUEUED' | 'RUNNING' | 'SIMULATED';
  flowSlug: string;
}

export class RenderWorkflowClient {
  private client: Render | null = null;
  public readonly isSimulation: boolean;

  constructor() {
    const apiKey = process.env.RENDER_API_KEY;
    if (apiKey && apiKey !== 'mock_render_key') {
      try {
        this.client = new Render({ token: apiKey });
        this.isSimulation = false;
        logger.info('Initialized live Render Workflows SDK client.');
      } catch (err: any) {
        logger.error('Failed to initialize live Render client, falling back to simulation mode', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
        this.isSimulation = true;
      }
    } else {
      this.isSimulation = true;
      logger.info('RENDER_API_KEY not configured or set to mock. Operating in graceful simulation mode.');
    }
  }

  /**
   * Dispatches the 72h Price-Drop Watcher Flow on Render Workflows
   */
  public async triggerPriceDropWatcher(params: {
    escrowOrderId: string;
    purchaseUnitIds: string[];
    channel3ProductId?: string;
  }): Promise<WorkflowDispatchResult> {
    const flowSlug = 'aegispay-workflows/priceDropWatcherFlow';
    const idempotencyKey = `pdw_${params.escrowOrderId}`;

    logger.info(`triggerPriceDropWatcher: attempting dispatch for flow ${flowSlug}`, sanitizeForLogging({
      escrowOrderId: params.escrowOrderId,
      purchaseUnitIdsCount: params.purchaseUnitIds?.length,
      channel3ProductId: params.channel3ProductId,
      idempotencyKey,
      isSimulation: this.isSimulation,
    }));

    if (this.client && !this.isSimulation) {
      try {
        logger.debug(`Transmitting live flow request to Render Workflows: slug=${flowSlug}, idempotencyKey=${idempotencyKey}`);
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        logger.info(`triggerPriceDropWatcher: live flow dispatched successfully with flowRunId=${started.id}`);
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        logger.error(`Live flow dispatch failed for ${flowSlug}, falling back to simulation`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
      }
    } else {
      logger.debug(`Skipping live API call (client available=${Boolean(this.client)}, isSimulation=${this.isSimulation})`);
    }

    const simRunId = `sim_pdw_${Date.now()}_${params.escrowOrderId.slice(0, 8)}`;
    logger.info(`triggerPriceDropWatcher: generated simulation runId=${simRunId}`);
    return {
      flowRunId: simRunId,
      status: 'SIMULATED',
      flowSlug,
    };
  }

  /**
   * Dispatches the Multi-Modal Vision Dispute Forensics Flow on Render Workflows
   */
  public async triggerDisputeForensics(params: {
    paypal_dispute_id: string;
    autonomy_mode?: string;
    force_tier?: string;
  }): Promise<WorkflowDispatchResult> {
    const flowSlug = 'aegispay-workflows/disputeForensicsFlow';
    const idempotencyKey = `disp_${params.paypal_dispute_id}`;

    logger.info(`triggerDisputeForensics: attempting dispatch for flow ${flowSlug}`, sanitizeForLogging({
      paypal_dispute_id: params.paypal_dispute_id,
      autonomy_mode: params.autonomy_mode,
      force_tier: params.force_tier,
      idempotencyKey,
      isSimulation: this.isSimulation,
    }));

    if (this.client && !this.isSimulation) {
      try {
        logger.debug(`Transmitting live flow request to Render Workflows: slug=${flowSlug}, idempotencyKey=${idempotencyKey}`);
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        logger.info(`triggerDisputeForensics: live flow dispatched successfully with flowRunId=${started.id}`);
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        logger.error(`Live flow dispatch failed for ${flowSlug}, falling back to simulation`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
      }
    } else {
      logger.debug(`Skipping live API call (client available=${Boolean(this.client)}, isSimulation=${this.isSimulation})`);
    }

    const simRunId = `sim_disp_${Date.now()}_${params.paypal_dispute_id.slice(0, 8)}`;
    logger.info(`triggerDisputeForensics: generated simulation runId=${simRunId}`);
    return {
      flowRunId: simRunId,
      status: 'SIMULATED',
      flowSlug,
    };
  }

  /**
   * Dispatches the Synthetic Bid Dutch Auction Matching Flow on Render Workflows
   */
  public async triggerSyntheticBidMatcher(params: {
    voucher_id: string;
  }): Promise<WorkflowDispatchResult> {
    const flowSlug = 'aegispay-workflows/syntheticBidMatcherFlow';
    const idempotencyKey = `syn_${params.voucher_id}`;

    logger.info(`triggerSyntheticBidMatcher: attempting dispatch for flow ${flowSlug}`, sanitizeForLogging({
      voucher_id: params.voucher_id,
      idempotencyKey,
      isSimulation: this.isSimulation,
    }));

    if (this.client && !this.isSimulation) {
      try {
        logger.debug(`Transmitting live flow request to Render Workflows: slug=${flowSlug}, idempotencyKey=${idempotencyKey}`);
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        logger.info(`triggerSyntheticBidMatcher: live flow dispatched successfully with flowRunId=${started.id}`);
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        logger.error(`Live flow dispatch failed for ${flowSlug}, falling back to simulation`, {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
      }
    } else {
      logger.debug(`Skipping live API call (client available=${Boolean(this.client)}, isSimulation=${this.isSimulation})`);
    }

    const simRunId = `sim_syn_${Date.now()}_${params.voucher_id.slice(0, 8)}`;
    logger.info(`triggerSyntheticBidMatcher: generated simulation runId=${simRunId}`);
    return {
      flowRunId: simRunId,
      status: 'SIMULATED',
      flowSlug,
    };
  }
}

export const renderWorkflowClient = new RenderWorkflowClient();
