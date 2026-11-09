import { Render } from '@renderinc/sdk';

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
        console.log('[RenderWorkflowClient] Initialized with live Render Workflows SDK.');
      } catch (err) {
        console.warn('[RenderWorkflowClient] Failed to initialize live Render client, falling back to simulation:', err);
        this.isSimulation = true;
      }
    } else {
      this.isSimulation = true;
      console.log('[RenderWorkflowClient] RENDER_API_KEY not configured. Operating in graceful simulation mode.');
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

    if (this.client && !this.isSimulation) {
      try {
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        console.warn(`[RenderWorkflowClient] Live flow dispatch failed for ${flowSlug}, using simulation fallback:`, err.message);
      }
    }

    return {
      flowRunId: `sim_pdw_${Date.now()}_${params.escrowOrderId.slice(0, 8)}`,
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

    if (this.client && !this.isSimulation) {
      try {
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        console.warn(`[RenderWorkflowClient] Live flow dispatch failed for ${flowSlug}, using simulation fallback:`, err.message);
      }
    }

    return {
      flowRunId: `sim_disp_${Date.now()}_${params.paypal_dispute_id.slice(0, 8)}`,
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

    if (this.client && !this.isSimulation) {
      try {
        const started = await this.client.workflows.startFlow(
          flowSlug as any,
          [params],
          { idempotencyKey }
        );
        return {
          flowRunId: started.id,
          status: 'QUEUED',
          flowSlug,
        };
      } catch (err: any) {
        console.warn(`[RenderWorkflowClient] Live flow dispatch failed for ${flowSlug}, using simulation fallback:`, err.message);
      }
    }

    return {
      flowRunId: `sim_syn_${Date.now()}_${params.voucher_id.slice(0, 8)}`,
      status: 'SIMULATED',
      flowSlug,
    };
  }
}

export const renderWorkflowClient = new RenderWorkflowClient();
