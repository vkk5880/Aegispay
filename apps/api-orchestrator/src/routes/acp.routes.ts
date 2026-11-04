import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import {
  ACP_MANIFEST,
  executeACPAction,
  ACPCreateCheckoutSessionSchema,
  ACPPaymentHandlerExecuteSchema,
  ACP_STANDARD_PAYMENT_HANDLERS,
} from '@aegispay/mcp-enforcer';
import { defaultTaxEstimator } from '../services/tax-estimator.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';
import { defaultVaultOnboardingService } from '../services/vault-onboarding.js';

const ACPActionRequestSchema = z.object({
  action: z.enum(['discover_products', 'request_purchase_quote', 'confirm_payment_hold']),
  parameters: z.record(z.any()),
});

// In-memory checkout sessions store for ACP sessions
interface StoredCheckoutSession {
  id: string;
  status: 'ready_for_payment' | 'completed' | 'cancelled';
  currency: string;
  items: Array<{
    id: string;
    name?: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }>;
  subtotal_cents: number;
  tax_cents: number;
  tax_rate_percentage: number;
  tax_state_code: string;
  postal_code?: string;
  shipping_fee_cents: number;
  total_cents: number;
  fulfillment_details?: any;
  order_notes?: string;
  mandate_id?: string;
  created_at: string;
  completed_at?: string;
  payment_execution?: any;
}

const checkoutSessionsStore = new Map<string, StoredCheckoutSession>();

export const acpRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /.well-known/acp.json
   * Public discovery endpoint for Agentic Commerce Protocol (ACP)
   * Complies with rfc.discovery.md and OpenAI ACP.
   */
  fastify.get('/.well-known/acp.json', async (request, reply) => {
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send({
      ...ACP_MANIFEST,
      protocol: ACP_MANIFEST.discovery_protocol || {
        name: 'acp',
        version: '2026-01-30',
        supported_versions: ['2025-09-29', '2025-12-12', '2026-01-16', '2026-01-30'],
      },
      api_base_url: ACP_MANIFEST.api_base_url || 'https://aegispay.dev/acp',
      transports: ACP_MANIFEST.transports || ['rest', 'mcp'],
      capabilities: ACP_MANIFEST.capabilities,
    });
  });

  /**
   * POST /acp/checkout_session
   * Initiates a standard ACP Checkout Session.
   * Performs jurisdictional tax calculation via TaxEstimatorService and constructs
   * authoritative cart totals and shipping options per rfc.agentic_checkout.md.
   */
  fastify.post('/acp/checkout_session', async (request, reply) => {
    const parseResult = ACPCreateCheckoutSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        type: 'invalid_request',
        code: 'invalid_parameter',
        message: 'Invalid ACP checkout session payload',
        details: parseResult.error.format(),
      });
    }

    const { currency, items, buyer, fulfillment_details, order_notes, mandate_id } = parseResult.data;

    const normalizedItems = items.map((item, idx) => {
      const unitPriceCents = item.unit_price_cents !== undefined ? item.unit_price_cents : 2500; // default $25.00
      const subtotalCents = unitPriceCents * item.quantity;
      return {
        id: item.id || `item_${idx + 1}`,
        name: item.name || `Item ${item.id}`,
        quantity: item.quantity,
        unit_price_cents: unitPriceCents,
        subtotal_cents: subtotalCents,
      };
    });

    const subtotalCents = normalizedItems.reduce((acc, it) => acc + it.subtotal_cents, 0);

    const postalCode = fulfillment_details?.address?.postal_code || null;
    const taxCalculation = defaultTaxEstimator.calculateTax(subtotalCents, postalCode);

    // Standard Shipping: $5.00 (waived if subtotal >= $100.00)
    const standardShippingCents = subtotalCents >= 10000 ? 0 : 500;
    const totalCents = subtotalCents + taxCalculation.tax_cents + standardShippingCents;

    const sessionId = `cs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const sessionData: StoredCheckoutSession = {
      id: sessionId,
      status: 'ready_for_payment',
      currency: currency.toLowerCase(),
      items: normalizedItems,
      subtotal_cents: subtotalCents,
      tax_cents: taxCalculation.tax_cents,
      tax_rate_percentage: taxCalculation.tax_rate_percentage,
      tax_state_code: taxCalculation.state_code,
      postal_code: postalCode || undefined,
      shipping_fee_cents: standardShippingCents,
      total_cents: totalCents,
      fulfillment_details,
      order_notes,
      mandate_id,
      created_at: new Date().toISOString(),
    };

    checkoutSessionsStore.set(sessionId, sessionData);

    const idempotencyKey = (request.headers['idempotency-key'] as string) || `idemp_${sessionId}`;
    reply.header('Idempotency-Key', idempotencyKey);
    reply.header('API-Version', '2026-01-30');

    return reply.status(201).send({
      id: sessionId,
      protocol: {
        name: 'acp',
        version: '2026-01-30',
      },
      status: 'ready_for_payment',
      currency: currency.toLowerCase(),
      line_items: normalizedItems.map((item) => ({
        id: `li_${item.id}`,
        item: {
          id: item.id,
          name: item.name,
        },
        quantity: item.quantity,
        unit_amount: item.unit_price_cents,
        totals: [
          { type: 'subtotal', display_text: 'Subtotal', amount: item.subtotal_cents },
        ],
      })),
      fulfillment_details: fulfillment_details || null,
      fulfillment_options: [
        {
          id: 'fo_standard',
          type: 'shipping',
          title: 'Standard Ground Shipping',
          description: standardShippingCents === 0 ? 'Free standard shipping' : 'Arrives in 3-5 business days',
          carrier: 'USPS',
          amount: standardShippingCents,
        },
        {
          id: 'fo_express',
          type: 'shipping',
          title: 'Express Overnight Shipping',
          description: 'Next business day priority dispatch',
          carrier: 'FedEx',
          amount: 1500,
        },
      ],
      selected_fulfillment_option: {
        id: 'fo_standard',
        type: 'shipping',
        amount: standardShippingCents,
      },
      totals: [
        { type: 'items_base_amount', display_text: 'Item(s) total', amount: subtotalCents },
        { type: 'subtotal', display_text: 'Subtotal', amount: subtotalCents },
        {
          type: 'tax',
          display_text: `Sales Tax (${taxCalculation.state_code} @ ${taxCalculation.tax_rate_percentage}%)`,
          amount: taxCalculation.tax_cents,
        },
        {
          type: 'fulfillment',
          display_text: 'Shipping',
          amount: standardShippingCents,
        },
        { type: 'total', display_text: 'Total Amount', amount: totalCents },
      ],
      capabilities: {
        payment: {
          handlers: ACP_STANDARD_PAYMENT_HANDLERS,
        },
        interventions: {
          supported: ['3ds', 'address_verification'],
          required: [],
        },
      },
      payment_handlers: ACP_STANDARD_PAYMENT_HANDLERS,
      created_at: sessionData.created_at,
    });
  });

  /**
   * POST /acp/payment_handler
   * Executes delegated tokenized payment using PayPal Vault tokens or APIMatic client.
   * Complies with rfc.payment_handlers.md & rfc.delegate_payment.md.
   */
  fastify.post('/acp/payment_handler', async (request, reply) => {
    const parseResult = ACPPaymentHandlerExecuteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        type: 'invalid_request',
        code: 'invalid_parameter',
        message: 'Invalid ACP payment handler payload',
        details: parseResult.error.format(),
      });
    }

    const {
      checkout_session_id,
      payment_handler_id,
      payment_token_id,
      mandate_id,
      buyer_id,
    } = parseResult.data;

    const session = checkoutSessionsStore.get(checkout_session_id);
    if (!session) {
      return reply.status(404).send({
        type: 'invalid_request',
        code: 'session_not_found',
        message: `Checkout session ${checkout_session_id} not found`,
      });
    }

    if (session.status === 'completed') {
      return reply.status(409).send({
        type: 'processing_error',
        code: 'session_already_completed',
        message: `Checkout session ${checkout_session_id} has already been completed`,
      });
    }

    try {
      // Execute autonomous delegated checkout pipeline via VaultOnboardingService
      const checkoutResult = await defaultVaultOnboardingService.executeDelegatedCheckout({
        paymentTokenId: payment_token_id,
        mandateId: mandate_id,
        currency: session.currency,
        totalCents: session.total_cents,
        subtotalCents: session.subtotal_cents,
        taxCents: session.tax_cents,
        shippingFeeCents: session.shipping_fee_cents,
        sessionId: session.id,
        payPalRequestId: (request.headers['idempotency-key'] as string) || undefined,
      });

      const orderId = checkoutResult.orderId;
      const captureId = checkoutResult.captureId;
      const effectiveTokenId = checkoutResult.paymentTokenId;

      // Update session status
      session.status = 'completed';
      session.completed_at = checkoutResult.completedAt;
      session.payment_execution = {
        handler_id: payment_handler_id,
        payment_token_id: effectiveTokenId,
        paypal_order_id: orderId,
        capture_id: captureId,
      };

      const idempotencyKey = (request.headers['idempotency-key'] as string) || `idemp_pay_${session.id}`;
      reply.header('Idempotency-Key', idempotencyKey);
      reply.header('API-Version', '2026-01-30');

      return reply.status(200).send({
        status: 'SUCCESS',
        protocol: 'OPENAI_ACP_v1',
        checkout_session_id: session.id,
        order: {
          id: orderId,
          capture_id: captureId,
          status: 'COMPLETED',
          intent: 'CAPTURE',
          amount: {
            currency: session.currency.toUpperCase(),
            total_cents: session.total_cents,
            total_amount: (session.total_cents / 100).toFixed(2),
          },
        },
        payment_handler: {
          id: payment_handler_id,
          psp: 'paypal',
          vault_payment_token_id: effectiveTokenId,
          delegated: true,
        },
        read_back_verified: checkoutResult.readBackVerified,
        completed_at: session.completed_at,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({
        type: 'processing_error',
        code: 'PAYMENT_CAPTURE_FAILED',
        message: err.message,
      });
    }
  });

  /**
   * POST /api/acp/actions
   * Executes standardized ACP commerce actions guarded by AegisPay policies
   */
  fastify.post('/api/acp/actions', async (request, reply) => {
    const parseResult = ACPActionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'INVALID_ACP_REQUEST',
        details: parseResult.error.format(),
      });
    }

    const { action, parameters } = parseResult.data;

    // For confirm_payment_hold, verify authentication headers or mandate parameters
    if (action === 'confirm_payment_hold') {
      const spendMandateId =
        (request.headers['x-spend-mandate-id'] as string | undefined) ||
        parameters.mandate_id;
      const syntheticVoucherId =
        (request.headers['x-synthetic-voucher-id'] as string | undefined) ||
        parameters.voucher_id;

      if (!spendMandateId && !syntheticVoucherId) {
        reply.status(402);
        reply.header('X-Payment-Contract-Id', `ct_acp_${Date.now()}`);
        reply.header(
          'X-PayPal-Vault-Setup-Url',
          process.env.PAYPAL_VAULT_SETUP_URL || 'https://www.sandbox.paypal.com/v3/vault/setup-tokens'
        );
        return reply.send({
          error: 'PAYMENT_REQUIRED',
          status: 402,
          message: 'Payment Required: Missing active mandate or voucher credentials for confirm_payment_hold.',
        });
      }
    }

    try {
      const result = await executeACPAction(action, parameters);
      return reply.send({
        status: 'SUCCESS',
        protocol: 'OPENAI_ACP_v1',
        ...result,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'ACP_ACTION_EXECUTION_FAILED',
        message: err.message,
      });
    }
  });
};
