import { task, flow, type FlowContext } from '@renderinc/sdk/workflows';
import { enhanceContext } from './types.js';
import { executeReverseShippingLabel } from './reverseShippingLabelTask.js';
import type { ReturnLabelInfo } from '@aegispay/shared-types';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('Workflows:Tasks');

export type CarrierEventType =
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_attempt'
  | 'ready_for_pickup'
  | 'undeliverable';

export interface FulfillmentEvent {
  order_id: string;
  tracking_number: string;
  carrier: string;
  event_type: CarrierEventType;
  reason?: string;
  location?: string;
  timestamp: string;
  delivery_attempt_count?: number;
}

export interface FulfillmentResolution {
  order_id: string;
  status: 'MONITORING' | 'ACTION_REQUIRED' | 'RESOLVED';
  suggested_action: 'NONE' | 'RESCHEDULE_DELIVERY' | 'HOLD_AT_LOCKER' | 'AUTO_PROVISION_RETURN_LABEL';
  resolution_options: string[];
  return_label?: ReturnLabelInfo;
  alert_message: string;
}

export async function processFulfillmentException(
  event: FulfillmentEvent
): Promise<FulfillmentResolution> {
  const attemptCount = event.delivery_attempt_count || 1;

  logger.info('processFulfillmentException invoked', {
    order_id: event.order_id,
    tracking_number: event.tracking_number,
    carrier: event.carrier,
    event_type: event.event_type,
    delivery_attempt_count: attemptCount,
    reason: event.reason || 'NONE',
    location: event.location || 'NONE',
    timestamp: event.timestamp,
  });

  if (event.event_type === 'failed_attempt') {
    logger.info(`Evaluating failed_attempt branch (attemptCount: ${attemptCount}) for order: ${event.order_id}`);
    if (attemptCount >= 3) {
      logger.warn(`Delivery attempt count ${attemptCount} >= 3. Automatically provisioning reverse shipping label to prevent formal PayPal dispute.`, {
        order_id: event.order_id,
        tracking_number: event.tracking_number,
      });

      try {
        // Automatic provision of reverse shipping label to prevent formal dispute
        const returnLabel = await executeReverseShippingLabel({
          disputeId: `dsp_ret_${event.order_id}`,
          transactionId: event.order_id,
          carrier: event.carrier || 'USPS',
        });

        logger.info(`Prepaid reverse shipping label auto-provisioned successfully for failed delivery attempt threshold`, {
          order_id: event.order_id,
          return_tracking_number: returnLabel.tracking_number,
          carrier: returnLabel.carrier,
        });

        return {
          order_id: event.order_id,
          status: 'ACTION_REQUIRED',
          suggested_action: 'AUTO_PROVISION_RETURN_LABEL',
          resolution_options: ['RESCHEDULE_CARRIER_DROP', 'CONFIRM_RETURN_MERCHANT'],
          return_label: returnLabel,
          alert_message: `Delivery failed after ${attemptCount} attempts. A prepaid return shipping label (${returnLabel.tracking_number}) has been auto-provisioned to protect your funds.`,
        };
      } catch (err: any) {
        logger.error(`Error auto-provisioning reverse shipping label on failed attempt #${attemptCount}`, {
          error_code: err?.code || 'AUTO_PROVISION_LABEL_ERROR',
          order_id: event.order_id,
          message: err?.message,
          stack: err?.stack,
        });
        throw err;
      }
    }

    logger.info(`Delivery attempt count ${attemptCount} < 3; proposing delivery reschedule or locker redirection`, {
      order_id: event.order_id,
      carrier: event.carrier,
      reason: event.reason,
    });

    return {
      order_id: event.order_id,
      status: 'ACTION_REQUIRED',
      suggested_action: 'RESCHEDULE_DELIVERY',
      resolution_options: ['RESCHEDULE_DELIVERY', 'REDIRECT_TO_LOCAL_LOCKER'],
      alert_message: `Carrier ${event.carrier} reported delivery attempt #${attemptCount} failed: ${event.reason || 'Notice left at front door'}. Choose a resolution option to avoid return.`,
    };
  }

  if (event.event_type === 'ready_for_pickup') {
    logger.info(`Evaluating ready_for_pickup branch for order ${event.order_id}`, {
      location: event.location,
    });

    return {
      order_id: event.order_id,
      status: 'ACTION_REQUIRED',
      suggested_action: 'HOLD_AT_LOCKER',
      resolution_options: ['CONFIRM_PICKUP_HOLD', 'REQUEST_REDELIVERY'],
      alert_message: `Package is ready for pickup at local carrier location: ${event.location || 'Local Depot'}. Pickup deadline in 5 business days.`,
    };
  }

  if (event.event_type === 'undeliverable') {
    logger.warn(`Evaluating undeliverable branch for order ${event.order_id} (Reason: ${event.reason || 'Address incorrect'}). Auto-provisioning return label.`, {
      order_id: event.order_id,
      carrier: event.carrier,
    });

    try {
      const returnLabel = await executeReverseShippingLabel({
        disputeId: `dsp_undeliv_${event.order_id}`,
        transactionId: event.order_id,
        carrier: event.carrier || 'USPS',
      });

      logger.info(`Return label successfully provisioned for undeliverable package: ${returnLabel.tracking_number}`, {
        order_id: event.order_id,
      });

      return {
        order_id: event.order_id,
        status: 'ACTION_REQUIRED',
        suggested_action: 'AUTO_PROVISION_RETURN_LABEL',
        resolution_options: ['CONFIRM_RETURN_MERCHANT'],
        return_label: returnLabel,
        alert_message: `Package deemed undeliverable by ${event.carrier} (${event.reason || 'Address incorrect'}). Prepaid return label provisioned.`,
      };
    } catch (err: any) {
      logger.error('Error auto-provisioning reverse shipping label for undeliverable package', {
        error_code: err?.code || 'UNDELIVERABLE_LABEL_ERROR',
        order_id: event.order_id,
        message: err?.message,
        stack: err?.stack,
      });
      throw err;
    }
  }

  const isDelivered = event.event_type === 'delivered';
  logger.info(`Evaluating standard transit status branch (${event.event_type}) for order ${event.order_id}. isDelivered=${isDelivered}`);

  return {
    order_id: event.order_id,
    status: isDelivered ? 'RESOLVED' : 'MONITORING',
    suggested_action: 'NONE',
    resolution_options: [],
    alert_message: `Shipment is currently ${event.event_type}.`,
  };
}

export const fulfillmentWatcherFlow = flow(
  {
    name: 'fulfillmentWatcherFlow',
    timeoutSeconds: 300,
    plan: 'flex',
  },
  async (ctx: FlowContext, event: FulfillmentEvent) => {
    const eCtx = enhanceContext(ctx);

    logger.info('fulfillmentWatcherFlow initiated', {
      order_id: event.order_id,
      event_type: event.event_type,
      tracking_number: event.tracking_number,
    });

    return await eCtx.step('process-fulfillment-event', async () => {
      logger.debug('Durable checkpoint: process-fulfillment-event');
      const res = await processFulfillmentException(event);
      logger.info('processFulfillmentException completed', {
        order_id: res.order_id,
        status: res.status,
        suggested_action: res.suggested_action,
      });
      return res;
    });
  }
);

export const fulfillmentWatcherTask = task(
  {
    name: 'fulfillmentWatcherTask',
  },
  fulfillmentWatcherFlow.func as any
);
