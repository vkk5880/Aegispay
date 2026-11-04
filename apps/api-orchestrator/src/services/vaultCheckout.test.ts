import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalApimaticClient } from './paypal-apimatic.js';
import { VaultOnboardingService } from './vault-onboarding.js';

test('Vault v3 Setup Token Creation: Mints setup token with usage_type MERCHANT for consumer onboarding', async () => {
  const paypalClient = new PayPalApimaticClient();
  const vaultService = new VaultOnboardingService(paypalClient);

  const session = await vaultService.createVaultSetupSession({
    customerId: 'cust_buyer_001',
    mandateId: 'mandate_spend_100',
    returnUrl: 'https://aegispay.dev/vault/return',
    cancelUrl: 'https://aegispay.dev/vault/cancel',
  });

  assert.ok(session.setup_token_id);
  assert.equal(session.customer_id, 'cust_buyer_001');
  assert.equal(session.mandate_id, 'mandate_spend_100');
  assert.equal(session.status, 'CREATED');
  assert.ok(session.approve_url);
  assert.ok(session.created_at);
});

test('Vault v3 Payment Token Conversion: Converts setup token into durable payment token and stores registry mapping', async () => {
  const paypalClient = new PayPalApimaticClient();
  const vaultService = new VaultOnboardingService(paypalClient);

  const session = await vaultService.createVaultSetupSession({
    customerId: 'cust_buyer_002',
    mandateId: 'mandate_spend_200',
  });

  const confirmed = await vaultService.confirmVaultPaymentToken({
    setupTokenId: session.setup_token_id,
    customerId: session.customer_id,
    mandateId: session.mandate_id,
  });

  assert.ok(confirmed.paypal_payment_token_id);
  assert.equal(confirmed.setup_token_id, session.setup_token_id);
  assert.equal(confirmed.status, 'VAULTED');
  assert.equal(confirmed.mandate_id, 'mandate_spend_200');

  // Verify retrieval from registry via mandateId
  const retrieved = vaultService.getVaultedTokenForMandate('mandate_spend_200');
  assert.ok(retrieved);
  assert.equal(retrieved.paypal_payment_token_id, confirmed.paypal_payment_token_id);
});

test('PayPalApimaticClient: Orders v2 createOrder and captureOrder with mandatory server read-back', async () => {
  const paypalClient = new PayPalApimaticClient();

  // Create order with intent CAPTURE
  const orderResult = await paypalClient.createOrder({
    intent: 'CAPTURE',
    purchaseUnits: [
      {
        reference_id: 'pu_test_unit_1',
        amount: {
          currency_code: 'USD',
          value: '150.00',
          breakdown: {
            item_total: { currency_code: 'USD', value: '150.00' },
          },
        },
        description: 'Autonomous auto-buy unit',
      },
    ],
    paymentSourceToken: 'vault_pm_token_test_123',
  }) as any;

  assert.ok(orderResult.id);
  assert.ok(['CREATED', 'COMPLETED'].includes(orderResult.status));

  // Capture order headless
  const captureResult = await paypalClient.captureOrder(orderResult.id) as any;
  assert.equal(captureResult.status, 'COMPLETED');
  assert.ok(captureResult.purchaseUnits[0].payments.captures[0].id);

  // Mandatory server read-back verification (GET /v2/checkout/orders/{id})
  const readBack = await paypalClient.getOrder(orderResult.id);
  assert.equal(readBack.id, orderResult.id);
  assert.equal(readBack.server_readback_verified, true);
  assert.ok(readBack.verification_timestamp);
});

test('Delegated Headless Auto-Buy: executeDelegatedCheckout completes end-to-end autonomous flow', async () => {
  const paypalClient = new PayPalApimaticClient();
  const vaultService = new VaultOnboardingService(paypalClient);

  // Register pre-authorized mandate vault token
  vaultService.registerVaultedToken({
    paypal_payment_token_id: 'vault_tok_preauth_agent_99',
    setup_token_id: 'setup_tok_preauth_agent_99',
    status: 'VAULTED',
    mandate_id: 'mandate_buyer_alpha',
    customer_id: 'cust_buyer_alpha',
    vaulted_at: new Date().toISOString(),
  });

  // Execute delegated headless checkout without human presence
  const checkoutResult = await vaultService.executeDelegatedCheckout({
    mandateId: 'mandate_buyer_alpha',
    currency: 'USD',
    totalCents: 12550, // $125.50
    subtotalCents: 11500,
    taxCents: 1050,
    shippingFeeCents: 0,
    sessionId: 'cs_agentic_test_01',
  });

  assert.equal(checkoutResult.status, 'COMPLETED');
  assert.ok(checkoutResult.orderId);
  assert.ok(checkoutResult.captureId);
  assert.equal(checkoutResult.intent, 'CAPTURE');
  assert.equal(checkoutResult.paymentTokenId, 'vault_tok_preauth_agent_99');
  assert.equal(checkoutResult.readBackVerified, true);
  assert.ok(checkoutResult.order);
  assert.equal(checkoutResult.order.server_readback_verified, true);
});

test('Delegated Headless Auto-Buy: supports custom multi-purchase units across multiple merchants', async () => {
  const paypalClient = new PayPalApimaticClient();
  const vaultService = new VaultOnboardingService(paypalClient);

  const customUnits = [
    {
      reference_id: 'pu_merchant_alpha',
      amount: {
        currency_code: 'USD',
        value: '75.00',
        breakdown: {
          item_total: { currency_code: 'USD', value: '75.00' },
        },
      },
      items: [
        {
          name: 'Noise Cancelling Headphones',
          unit_amount: { currency_code: 'USD', value: '75.00' },
          quantity: '1',
          sku: 'sku_alpha_01',
          category: 'PHYSICAL_GOODS' as const,
        },
      ],
      description: 'Vendor Alpha Purchase Unit',
    },
    {
      reference_id: 'pu_merchant_beta',
      amount: {
        currency_code: 'USD',
        value: '45.00',
        breakdown: {
          item_total: { currency_code: 'USD', value: '45.00' },
        },
      },
      items: [
        {
          name: 'Headphone Stand & Cable Pack',
          unit_amount: { currency_code: 'USD', value: '45.00' },
          quantity: '1',
          sku: 'sku_beta_02',
          category: 'PHYSICAL_GOODS' as const,
        },
      ],
      description: 'Vendor Beta Purchase Unit',
    },
  ];

  const checkoutResult = await vaultService.executeDelegatedCheckout({
    paymentTokenId: 'vault_direct_tok_888',
    currency: 'USD',
    totalCents: 12000,
    purchaseUnits: customUnits,
    sessionId: 'cs_multi_vendor_01',
  });

  assert.equal(checkoutResult.status, 'COMPLETED');
  assert.ok(checkoutResult.orderId);
  assert.ok(checkoutResult.captureId);
  assert.equal(checkoutResult.paymentTokenId, 'vault_direct_tok_888');
  assert.equal(checkoutResult.readBackVerified, true);
});
