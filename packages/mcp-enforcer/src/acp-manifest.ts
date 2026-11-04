import { z } from 'zod';
import {
  toolHandlers,
  OptimizeBasketSchema,
  AuthorizeEscrowOrderSchema,
  BroadcastSyntheticIntentSchema,
} from './custom-tools.js';

/**
 * OpenAI Agentic Commerce Protocol (ACP) Manifest Specification
 * Standards-compliant definition mapping ACP commerce intents directly into
 * AegisPay's guarded action pipeline.
 *
 * Implements:
 * 1. Discovery document per RFC Agentic Checkout Discovery (rfc.discovery.md)
 * 2. Checkout session schemas per RFC Agentic Checkout (rfc.agentic_checkout.md)
 * 3. Payment handler schemas per RFC Payment Handlers (rfc.payment_handlers.md)
 * 4. Delegate payment schemas per RFC Delegate Payment (rfc.delegate_payment.md)
 */

export interface ACPDiscoveryProtocol {
  name: 'acp';
  version: string;
  supported_versions: string[];
  documentation_url?: string;
}

export interface ACPPaymentHandlerConfig {
  merchant_id: string;
  psp: 'paypal' | 'seller_managed' | string;
  accepted_brands?: string[];
  accepted_funding_types?: string[];
  supports_vault?: boolean;
  supports_3ds?: boolean;
  environment?: 'sandbox' | 'production';
  display_name?: string;
}

export interface ACPPaymentHandlerDescriptor {
  id: string;
  name: string;
  display_name: string;
  version: string;
  spec: string;
  requires_delegate_payment: boolean;
  requires_pci_compliance: boolean;
  psp: string;
  config_schema?: string;
  instrument_schemas?: string[];
  config: ACPPaymentHandlerConfig;
  display_order?: number;
}

export interface ACPDiscoveryCapabilities {
  services: string[];
  payment_handlers: ACPPaymentHandlerDescriptor[];
  supported_currencies: string[];
  supported_locales?: string[];
  interventions?: {
    supported: string[];
  };
}

export interface ACPManifest {
  schema_version: 'v1';
  name_for_model: 'aegispay_agentic_commerce';
  name_for_human: 'AegisPay Autonomous Clearinghouse & Interoperability Gateway';
  description_for_model: string;
  description_for_human: string;
  protocol: 'OPENAI_ACP_v1';
  contact_email: 'security@aegispay.dev';
  legal_info_url: 'https://aegispay.dev/legal';
  actions: ACPActionDescriptor[];
  // Standard RFC Discovery Fields (rfc.discovery.md)
  discovery_protocol?: ACPDiscoveryProtocol;
  api_base_url?: string;
  transports?: string[];
  capabilities?: ACPDiscoveryCapabilities;
}

export interface ACPActionDescriptor {
  name: string;
  description: string;
  parameters: Record<string, any>;
  returns: Record<string, any>;
  guarded_aegis_action: string;
}

export const ACPDiscoverProductsSchema = z.object({
  query: z.string().optional(),
  category_ids: z.array(z.string()).optional(),
  hex_color: z.string().optional(),
  image_url: z.string().url().optional(),
  allowance_voucher_id: z.string().default('acp_guest_allowance'),
});

export const ACPRequestPurchaseQuoteSchema = z.object({
  mandate_id: z.string().max(32),
  channel3_product_id: z.string().max(64),
  merchant_domain: z.string().max(128),
  retail_offer_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive(),
});

export const ACPConfirmPaymentHoldSchema = z.object({
  mandate_id: z.string().max(32),
  merchant_domain: z.string().max(128),
  requested_cents: z.number().int().positive(),
  category_id: z.string(),
  items: z.array(
    z.object({
      product_id: z.string(),
      price_cents: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
  ),
});

/**
 * Standard ACP Checkout Session Schemas
 */
export const ACPAddressSchema = z.object({
  name: z.string().optional(),
  line_one: z.string(),
  line_two: z.string().optional().default(''),
  city: z.string(),
  state: z.string().optional(),
  country: z.string().default('US'),
  postal_code: z.string(),
});

export const ACPFulfillmentDetailsSchema = z.object({
  name: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().email().optional(),
  address: ACPAddressSchema,
});

export const ACPCheckoutItemInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  unit_price_cents: z.number().int().nonnegative().optional(),
  currency: z.string().default('usd'),
  url: z.string().url().optional(),
  merchant_domain: z.string().optional(),
});

export const ACPCreateCheckoutSessionSchema = z.object({
  currency: z.string().default('usd'),
  items: z.array(ACPCheckoutItemInputSchema).min(1),
  buyer: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  fulfillment_details: ACPFulfillmentDetailsSchema.optional(),
  order_notes: z.string().optional(),
  mandate_id: z.string().optional(),
});

/**
 * Standard ACP Payment Handler Execution Schema
 */
export const ACPPaymentHandlerExecuteSchema = z.object({
  checkout_session_id: z.string(),
  payment_handler_id: z.string().default('paypal_vault_v3'),
  payment_token_id: z.string().optional(), // paypal_payment_token_id or vaulted token
  mandate_id: z.string().optional(),
  buyer_id: z.string().optional(),
  idempotency_key: z.string().optional(),
});

export const ACP_STANDARD_PAYMENT_HANDLERS: ACPPaymentHandlerDescriptor[] = [
  {
    id: 'paypal_vault_v3',
    name: 'dev.acp.paypal.vault_v3',
    display_name: 'PayPal Vault v3 Pre-Authorization',
    version: '2026-01-30',
    spec: 'https://aegispay.dev/specs/handlers/paypal-vault',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'paypal',
    config_schema: 'https://aegispay.dev/schemas/handlers/paypal-vault/config.json',
    instrument_schemas: ['https://aegispay.dev/schemas/handlers/paypal-vault/instrument.json'],
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'paypal',
      accepted_brands: ['paypal', 'venmo', 'visa', 'mastercard', 'amex'],
      accepted_funding_types: ['credit', 'debit', 'balance'],
      supports_vault: true,
      supports_3ds: true,
      environment: process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      display_name: 'PayPal Vault Token (One-Click Autonomous Auto-Buy)',
    },
    display_order: 1,
  },
  {
    id: 'card_tokenized',
    name: 'dev.acp.tokenized.card',
    display_name: 'Credit Card Token',
    version: '2026-01-22',
    spec: 'https://acp.dev/specs/handlers/card',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'paypal',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'paypal',
      accepted_brands: ['visa', 'mastercard', 'amex', 'discover'],
      accepted_funding_types: ['credit', 'debit'],
      supports_vault: true,
      supports_3ds: true,
      environment: process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    },
    display_order: 2,
  },
];

export const ACP_MANIFEST: ACPManifest = {
  schema_version: 'v1',
  name_for_model: 'aegispay_agentic_commerce',
  name_for_human: 'AegisPay Autonomous Clearinghouse & Interoperability Gateway',
  description_for_model:
    'Standardized OpenAI Agentic Commerce Protocol (ACP) adapter bridging autonomous discovery, quotes, and conditional payment holds to AegisPay Ed25519-signed spend mandates and PayPal v2/v3 rails.',
  description_for_human:
    'Autonomous agentic commerce protocol gateway providing discover_products, request_purchase_quote, and confirm_payment_hold tools guarded by atomic Redis Lua spend enforcement.',
  protocol: 'OPENAI_ACP_v1',
  contact_email: 'security@aegispay.dev',
  legal_info_url: 'https://aegispay.dev/legal',
  // Standard RFC Discovery Fields (rfc.discovery.md)
  discovery_protocol: {
    name: 'acp',
    version: '2026-01-30',
    supported_versions: ['2025-09-29', '2025-12-12', '2026-01-16', '2026-01-30'],
    documentation_url: 'https://aegispay.dev/docs/acp',
  },
  api_base_url: process.env.API_BASE_URL || 'https://aegispay.dev/acp',
  transports: ['rest', 'mcp'],
  capabilities: {
    services: ['checkout', 'delegate_payment', 'orders', 'actions'],
    payment_handlers: ACP_STANDARD_PAYMENT_HANDLERS,
    supported_currencies: ['USD'],
    supported_locales: ['en-US'],
    interventions: {
      supported: ['3ds', 'address_verification'],
    },
  },
  actions: [
    {
      name: 'discover_products',
      description:
        'Discover, multi-modal search, and optimize products across multi-merchant catalogs with commission rebates.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Product keywords or natural language request' },
          category_ids: { type: 'array', items: { type: 'string' }, description: 'Channel3 category identifiers' },
          hex_color: { type: 'string', description: 'Inspiration color hex palette (e.g., #3b82f6)' },
          image_url: { type: 'string', description: 'Visual inspiration image URL' },
          allowance_voucher_id: { type: 'string', description: 'Active buyer allowance or guest voucher ID' },
        },
      },
      returns: {
        type: 'object',
        properties: {
          basket_total_cents: { type: 'number' },
          assignments: { type: 'array' },
          net_buyer_expenditure_cents: { type: 'number' },
        },
      },
      guarded_aegis_action: 'optimize_channel3_multi_merchant_basket',
    },
    {
      name: 'request_purchase_quote',
      description:
        'Requests a synthetic intent discount quote backed by a PayPal Vault v3 setup token when basket cost exceeds budget cap.',
      parameters: {
        type: 'object',
        properties: {
          mandate_id: { type: 'string', description: 'Active Ed25519 spend mandate ID' },
          channel3_product_id: { type: 'string', description: 'Channel3 Product ID' },
          merchant_domain: { type: 'string', description: 'Target merchant domain' },
          retail_offer_cents: { type: 'number', description: 'Original retail price in cents' },
          buyer_bid_cents: { type: 'number', description: 'Buyer synthetic intent bid in cents' },
        },
        required: ['mandate_id', 'channel3_product_id', 'merchant_domain', 'retail_offer_cents', 'buyer_bid_cents'],
      },
      returns: {
        type: 'object',
        properties: {
          voucher_id: { type: 'string' },
          setup_token_id: { type: 'string' },
          status: { type: 'string' },
        },
      },
      guarded_aegis_action: 'broadcast_synthetic_intent_voucher',
    },
    {
      name: 'confirm_payment_hold',
      description:
        'Executes conditional escrow payment hold via multi-purchase unit PayPal Orders v2 AUTHORIZE guarded by Redis Lua spend enforcement.',
      parameters: {
        type: 'object',
        properties: {
          mandate_id: { type: 'string', description: 'Active Ed25519 spend mandate ID' },
          merchant_domain: { type: 'string', description: 'Merchant domain' },
          requested_cents: { type: 'number', description: 'Authorized hold amount in cents' },
          category_id: { type: 'string', description: 'Category identifier' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string' },
                price_cents: { type: 'number' },
                quantity: { type: 'number' },
              },
              required: ['product_id', 'price_cents', 'quantity'],
            },
          },
        },
        required: ['mandate_id', 'merchant_domain', 'requested_cents', 'category_id', 'items'],
      },
      returns: {
        type: 'object',
        properties: {
          paypal_order_id: { type: 'string' },
          invoice_id: { type: 'string' },
          status: { type: 'string' },
        },
      },
      guarded_aegis_action: 'authorize_conditional_escrow_order',
    },
  ],
};

/**
 * ACP Action Dispatcher
 * Bridges standard ACP action calls directly to AegisPay guarded tool handlers.
 */
export async function executeACPAction(actionName: string, params: Record<string, any>) {
  switch (actionName) {
    case 'discover_products': {
      const parsed = ACPDiscoverProductsSchema.parse(params);
      const res = await toolHandlers.handleOptimizeBasket({
        allowance_voucher_id: parsed.allowance_voucher_id,
        search_query: parsed.query,
        category_ids: parsed.category_ids,
        hex_color: parsed.hex_color,
        image_url: parsed.image_url,
      });
      return { action: 'discover_products', result: res };
    }
    case 'request_purchase_quote': {
      const parsed = ACPRequestPurchaseQuoteSchema.parse(params);
      const res = await toolHandlers.handleBroadcastIntent(parsed);
      return { action: 'request_purchase_quote', result: res };
    }
    case 'confirm_payment_hold': {
      const parsed = ACPConfirmPaymentHoldSchema.parse(params);
      const res = await toolHandlers.handleAuthorizeEscrow(parsed);
      return { action: 'confirm_payment_hold', result: res };
    }
    default:
      throw new Error(`Unsupported ACP action: ${actionName}. Supported actions: discover_products, request_purchase_quote, confirm_payment_hold`);
  }
}
