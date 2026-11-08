import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processFulfillmentException,
  FulfillmentEvent,
} from './fulfillmentWatcherTask.js';

describe('Phase 5: Fulfillment Exception Worker & Return Provisioning', () => {
  it('handles first failed delivery attempt with reschedule options', async () => {
    const event: FulfillmentEvent = {
      order_id: 'ord_fail_01',
      tracking_number: '940012345678',
      carrier: 'FedEx',
      event_type: 'failed_attempt',
      delivery_attempt_count: 1,
      reason: 'Customer not available',
      timestamp: new Date().toISOString(),
    };

    const resolution = await processFulfillmentException(event);
    assert.equal(resolution.order_id, 'ord_fail_01');
    assert.equal(resolution.status, 'ACTION_REQUIRED');
    assert.equal(resolution.suggested_action, 'RESCHEDULE_DELIVERY');
    assert.ok(resolution.resolution_options.includes('RESCHEDULE_DELIVERY'));
    assert.ok(resolution.resolution_options.includes('REDIRECT_TO_LOCAL_LOCKER'));
    assert.equal(resolution.return_label, undefined);
  });

  it('automatically provisions prepaid reverse shipping label when attempts reach threshold (>= 3)', async () => {
    const event: FulfillmentEvent = {
      order_id: 'ord_fail_03',
      tracking_number: '940098765432',
      carrier: 'USPS',
      event_type: 'failed_attempt',
      delivery_attempt_count: 3,
      reason: 'No response after 3 notices',
      timestamp: new Date().toISOString(),
    };

    const resolution = await processFulfillmentException(event);
    assert.equal(resolution.order_id, 'ord_fail_03');
    assert.equal(resolution.status, 'ACTION_REQUIRED');
    assert.equal(resolution.suggested_action, 'AUTO_PROVISION_RETURN_LABEL');
    assert.ok(resolution.return_label, 'Must auto-provision return label');
    assert.ok(resolution.return_label.tracking_number.startsWith('940011189922'));
    assert.equal(resolution.return_label.carrier, 'USPS');
    assert.ok(resolution.return_label.qr_code_base64.length > 0);
  });

  it('handles ready_for_pickup with locker deadline advisory', async () => {
    const event: FulfillmentEvent = {
      order_id: 'ord_pickup_01',
      tracking_number: '1Z9999999999999999',
      carrier: 'UPS',
      event_type: 'ready_for_pickup',
      location: 'UPS Access Point #402',
      timestamp: new Date().toISOString(),
    };

    const resolution = await processFulfillmentException(event);
    assert.equal(resolution.order_id, 'ord_pickup_01');
    assert.equal(resolution.suggested_action, 'HOLD_AT_LOCKER');
    assert.ok(resolution.alert_message.includes('UPS Access Point #402'));
  });

  it('handles undeliverable shipments by auto-provisioning return labels', async () => {
    const event: FulfillmentEvent = {
      order_id: 'ord_undeliv_01',
      tracking_number: '940055555555',
      carrier: 'USPS',
      event_type: 'undeliverable',
      reason: 'Insufficient address',
      timestamp: new Date().toISOString(),
    };

    const resolution = await processFulfillmentException(event);
    assert.equal(resolution.suggested_action, 'AUTO_PROVISION_RETURN_LABEL');
    assert.ok(resolution.return_label);
    assert.equal(resolution.return_label.carrier, 'USPS');
  });

  it('resolves delivered status cleanly', async () => {
    const event: FulfillmentEvent = {
      order_id: 'ord_deliv_01',
      tracking_number: '940077777777',
      carrier: 'USPS',
      event_type: 'delivered',
      timestamp: new Date().toISOString(),
    };

    const resolution = await processFulfillmentException(event);
    assert.equal(resolution.status, 'RESOLVED');
    assert.equal(resolution.suggested_action, 'NONE');
  });
});
