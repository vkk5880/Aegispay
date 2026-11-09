import { task, flow, type FlowContext } from '@renderinc/sdk/workflows';
import { enhanceContext } from './types.js';
import { executeReverseShippingLabel } from './reverseShippingLabelTask.js';
import type { ReturnLabelInfo } from '@aegispay/shared-types';

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

  if (event.event_type === 'failed_attempt') {
    if (attemptCount >= 3) {
      // Automatic provision of reverse shipping label to prevent formal dispute
      const returnLabel = await executeReverseShippingLabel({
        disputeId: `dsp_ret_${event.order_id}`,
        transactionId: event.order_id,
        carrier: event.carrier || 'USPS',
      });

      return {
        order_id: event.order_id,
        status: 'ACTION_REQUIRED',
        suggested_action: 'AUTO_PROVISION_RETURN_LABEL',
        resolution_options: ['RESCHEDULE_CARRIER_DROP', 'CONFIRM_RETURN_MERCHANT'],
        return_label: returnLabel,
        alert_message: `Delivery failed after ${attemptCount} attempts. A prepaid return shipping label (${returnLabel.tracking_number}) has been auto-provisioned to protect your funds.`,
      };
    }

    return {
      order_id: event.order_id,
      status: 'ACTION_REQUIRED',
      suggested_action: 'RESCHEDULE_DELIVERY',
      resolution_options: ['RESCHEDULE_DELIVERY', 'REDIRECT_TO_LOCAL_LOCKER'],
      alert_message: `Carrier ${event.carrier} reported delivery attempt #${attemptCount} failed: ${event.reason || 'Notice left at front door'}. Choose a resolution option to avoid return.`,
    };
  }

  if (event.event_type === 'ready_for_pickup') {
    return {
      order_id: event.order_id,
      status: 'ACTION_REQUIRED',
      suggested_action: 'HOLD_AT_LOCKER',
      resolution_options: ['CONFIRM_PICKUP_HOLD', 'REQUEST_REDELIVERY'],
      alert_message: `Package is ready for pickup at local carrier location: ${event.location || 'Local Depot'}. Pickup deadline in 5 business days.`,
    };
  }

  if (event.event_type === 'undeliverable') {
    const returnLabel = await executeReverseShippingLabel({
      disputeId: `dsp_undeliv_${event.order_id}`,
      transactionId: event.order_id,
      carrier: event.carrier || 'USPS',
    });

    return {
      order_id: event.order_id,
      status: 'ACTION_REQUIRED',
      suggested_action: 'AUTO_PROVISION_RETURN_LABEL',
      resolution_options: ['CONFIRM_RETURN_MERCHANT'],
      return_label: returnLabel,
      alert_message: `Package deemed undeliverable by ${event.carrier} (${event.reason || 'Address incorrect'}). Prepaid return label provisioned.`,
    };
  }

  return {
    order_id: event.order_id,
    status: event.event_type === 'delivered' ? 'RESOLVED' : 'MONITORING',
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
    return await eCtx.step('process-fulfillment-event', async () => {
      return await processFulfillmentException(event);
    });
  }
);

export const fulfillmentWatcherTask = task(
  {
    name: 'fulfillmentWatcherTask',
  },
  fulfillmentWatcherFlow.func as any
);
