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
  [key: string]: any;
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
  extensions?: any[];
  [key: string]: any;
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
  returns?: Record<string, any>;
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


/**
 * Canonical ACP MCP Checkout Tool Schemas (docs/mcp-binding.md)
 * Strict JSON-RPC 2.0 argument validation with { meta, id, payload } envelope
 */
export const ACPMCPCreateCheckoutSessionSchema = z.object({
  meta: z.object({
    api_version: z.string().min(1),
    idempotency_key: z.string().optional(),
    request_id: z.string().optional(),
    user_agent: z.string().optional(),
    accept_language: z.string().optional(),
    signature: z.string().optional(),
    timestamp: z.string().optional(),
  }).passthrough(),
  payload: z.object({
    currency: z.string().default('usd'),
    items: z.array(z.object({
      id: z.string(),
      quantity: z.number().int().positive(),
      unit_price_cents: z.number().int().nonnegative().optional(),
      name: z.string().optional(),
    })).min(1),
    buyer: z.object({
      email: z.string().email().optional(),
      name: z.string().optional(),
    }).optional(),
    fulfillment_details: z.any().optional(),
    affiliate_attribution: z.any().optional(),
    order_notes: z.string().optional(),
    mandate_id: z.string().optional(),
  }),
});

export const ACPMCPGetCheckoutSessionSchema = z.object({
  meta: z.object({
    api_version: z.string().min(1),
    request_id: z.string().optional(),
  }).passthrough(),
  id: z.string().min(1),
});

export const ACPMCPUpdateCheckoutSessionSchema = z.object({
  meta: z.object({
    api_version: z.string().min(1),
    idempotency_key: z.string().optional(),
    request_id: z.string().optional(),
  }).passthrough(),
  id: z.string().min(1),
  payload: z.object({
    items: z.array(z.any()).optional(),
    buyer: z.any().optional(),
    fulfillment_details: z.any().optional(),
    order_notes: z.string().optional(),
  }),
});

export const ACPMCPCompleteCheckoutSessionSchema = z.object({
  meta: z.object({
    api_version: z.string().min(1),
    idempotency_key: z.string().optional(),
    request_id: z.string().optional(),
  }).passthrough(),
  id: z.string().min(1),
  payload: z.object({
    payment_method: z.object({
      type: z.string(),
      token: z.string().optional(),
      mandate_signature: z.string().optional(),
      public_key_hex: z.string().optional(),
    }),
    affiliate_attribution: z.any().optional(),
    mandate_id: z.string().optional(),
  }),
});

export const ACPMCPCancelCheckoutSessionSchema = z.object({
  meta: z.object({
    api_version: z.string().min(1),
    request_id: z.string().optional(),
  }).passthrough(),
  id: z.string().min(1),
  payload: z.object({
    reason: z.string().optional(),
    intent_trace: z.record(z.string(), z.any()).optional(),
  }).optional(),
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
  {
    id: 'seller_saved_card',
    name: 'dev.acp.seller_backed.saved_card',
    display_name: 'Saved Card at Seller',
    version: '2026-02-05',
    spec: 'https://acp.dev/handlers/seller_backed/saved_card',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'seller_managed',
      payment_method_id: 'wmt_pm_123',
      display_name: 'Visa ending in 4242',
      display_metadata: {
        brand: 'visa',
        last4: '4242',
      },
      supports_3ds: true,
    },
    display_order: 3,
  },
  {
    id: 'seller_gift_card',
    name: 'dev.acp.seller_backed.gift_card',
    display_name: 'Merchant Gift Card',
    version: '2026-02-05',
    spec: 'https://acp.dev/handlers/seller_backed/gift_card',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'seller_managed',
      display_name: 'Aegis Gift Card',
      required_fields: [
        {
          name: 'card_number',
          label: 'Gift Card Number',
          type: 'text',
          required: true,
          pattern: '^[0-9]{16}$',
        },
        {
          name: 'pin',
          label: 'PIN',
          type: 'text',
          required: true,
          pattern: '^[0-9]{4}$',
          secure: true,
        },
      ],
    },
    display_order: 4,
  },
  {
    id: 'seller_points',
    name: 'dev.acp.seller_backed.points',
    display_name: 'Loyalty Rewards Points',
    version: '2026-02-05',
    spec: 'https://acp.dev/handlers/seller_backed/points',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'seller_managed',
      display_name: 'Aegis Rewards Points',
      display_metadata: {
        balance: 25000,
        balance_display: '25,000 points ($250.00)',
        conversion_rate: '100 points = $1.00',
      },
    },
    display_order: 5,
  },
  {
    id: 'seller_store_credit',
    name: 'dev.acp.seller_backed.store_credit',
    display_name: 'Aegis Store Credit',
    version: '2026-02-05',
    spec: 'https://acp.dev/handlers/seller_backed/store_credit',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      psp: 'seller_managed',
      display_name: 'Store Credit Balance',
      display_metadata: {
        balance: 50000,
        balance_display: '$500.00 Store Credit',
      },
    },
    display_order: 6,
  },
  // original store credit replaced above
  /*
    display_name: 'Aegis Store Credit',
    version: '2026-02-05',
    spec: 'https://aegispay.dev/specs/handlers/seller_backed',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
      supports_partial_redemption: true,
    },
    display_order: 3,
  },
  {
    id: 'seller_gift_card',
    name: 'dev.acp.seller_backed.gift_card',
    display_name: 'Merchant Gift Card',
    version: '2026-02-05',
    spec: 'https://aegispay.dev/specs/handlers/seller_backed',
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: 'seller_managed',
    config: {
      merchant_id: 'aegispay_clearinghouse',
    },
    display_order: 4,
  },
  */

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
    supported_versions: ['2025-09-29', '2025-12-12', '2026-01-16', '2026-01-30', '2026-04-17'],
    documentation_url: 'https://aegispay.dev/docs/acp',
  },
  api_base_url: process.env.API_BASE_URL || 'https://aegispay.dev/acp',
  transports: ['rest', 'mcp'],
  capabilities: {
    services: ['checkout', 'delegate_payment', 'orders', 'actions', 'carts', 'delegate_authentication'],
    payment_handlers: ACP_STANDARD_PAYMENT_HANDLERS,
    supported_currencies: ['USD'],
    supported_locales: ['en-US'],
    extensions: [
      {
        name: 'discount',
        extends: [
          '$.CheckoutSessionCreateRequest.discounts',
          '$.CheckoutSessionUpdateRequest.discounts',
          '$.CheckoutSession.discounts',
        ],
      },
    ],
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
      name: 'create_checkout_session',
      description: 'ACP MCP Tool: Creates a checkout session with authoritative cart totals and fulfillment options.',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'object', properties: { api_version: { type: 'string' } }, required: ['api_version'] },
          payload: { type: 'object', properties: { currency: { type: 'string' }, items: { type: 'array' } }, required: ['items'] },
        },
        required: ['meta', 'payload'],
      },
      guarded_aegis_action: 'create_checkout_session',
    },
    {
      name: 'get_checkout_session',
      description: 'ACP MCP Tool: Retrieves the authoritative state of an active checkout session.',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'object', properties: { api_version: { type: 'string' } }, required: ['api_version'] },
          id: { type: 'string', description: 'Checkout session ID' },
        },
        required: ['meta', 'id'],
      },
      guarded_aegis_action: 'get_checkout_session',
    },
    {
      name: 'update_checkout_session',
      description: 'ACP MCP Tool: Full replacement update of line items, fulfillment details, or buyer in checkout session.',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'object', properties: { api_version: { type: 'string' } }, required: ['api_version'] },
          id: { type: 'string', description: 'Checkout session ID' },
          payload: { type: 'object' },
        },
        required: ['meta', 'id', 'payload'],
      },
      guarded_aegis_action: 'update_checkout_session',
    },
    {
      name: 'complete_checkout_session',
      description: 'ACP MCP Tool: Submits payment instrument or vaulted token and finalizes order on merchant rails.',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'object', properties: { api_version: { type: 'string' } }, required: ['api_version'] },
          id: { type: 'string', description: 'Checkout session ID' },
          payload: { type: 'object', properties: { payment_method: { type: 'object' } }, required: ['payment_method'] },
        },
        required: ['meta', 'id', 'payload'],
      },
      guarded_aegis_action: 'complete_checkout_session',
    },
    {
      name: 'cancel_checkout_session',
      description: 'ACP MCP Tool: Cancels an active checkout session with optional intent trace.',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'object', properties: { api_version: { type: 'string' } }, required: ['api_version'] },
          id: { type: 'string', description: 'Checkout session ID' },
          payload: { type: 'object', properties: { reason: { type: 'string' } } },
        },
        required: ['meta', 'id'],
      },
      guarded_aegis_action: 'cancel_checkout_session',
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

export const acp_version = '2026-01-30';

export function generateACPManifest(): ACPManifest {
  return ACP_MANIFEST;
}

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
    case 'create_checkout_session': {
      const parsed = ACPMCPCreateCheckoutSessionSchema.parse(params);
      const res = await toolHandlers.handleCreateCheckoutSession(parsed);
      return { action: 'create_checkout_session', result: res };
    }
    case 'get_checkout_session': {
      const parsed = ACPMCPGetCheckoutSessionSchema.parse(params);
      const res = await toolHandlers.handleGetCheckoutSession(parsed);
      return { action: 'get_checkout_session', result: res };
    }
    case 'update_checkout_session': {
      const parsed = ACPMCPUpdateCheckoutSessionSchema.parse(params);
      const res = await toolHandlers.handleUpdateCheckoutSession(parsed);
      return { action: 'update_checkout_session', result: res };
    }
    case 'complete_checkout_session': {
      const parsed = ACPMCPCompleteCheckoutSessionSchema.parse(params);
      const res = await toolHandlers.handleCompleteCheckoutSession(parsed);
      return { action: 'complete_checkout_session', result: res };
    }
    case 'cancel_checkout_session': {
      const parsed = ACPMCPCancelCheckoutSessionSchema.parse(params);
      const res = await toolHandlers.handleCancelCheckoutSession(parsed);
      return { action: 'cancel_checkout_session', result: res };
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

// ============================================================================
// BAZAAR DISCOVERY EXTENSION INTEGRATION (Stream 4: ACP & Mastra Workflow DAG)
// Dynamic cataloging & discovery manifests for HTTP endpoints & MCP tools
// ============================================================================

export interface BazaarRouteExtensionConfig {
  path: string;
  method?: string;
  bazaar?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    toolName?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
}

export interface BazaarDiscoveryManifest {
  version: '2';
  timestamp: string;
  origin: string;
  catalogUrl: string;
  resources: Array<{
    type: 'http' | 'mcp';
    url?: string;
    method?: string;
    toolName?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }>;
}

/**
 * Validates route configuration to check whether Bazaar discovery metadata is present
 */
export function checkIfBazaarNeeded(routes: Record<string, any>): boolean {
  if (!routes || typeof routes !== 'object') return false;
  return Object.values(routes).some(r => r && (r.bazaar || (r.extensions && r.extensions['bazaar'])));
}

/**
 * Validates route templates and parameter schemas for Bazaar routes
 */
export function validateBazaarRouteExtensions(routes: Record<string, any>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!routes || typeof routes !== 'object') return { isValid: true, errors };

  for (const [path, config] of Object.entries(routes)) {
    // Validate path template syntax: {param}
    const matches = path.match(/\{[^}]*\}/g) || [];
    for (const m of matches) {
      if (m === '{}' || m.includes(' ') || m.includes('/')) {
        errors.push(`Invalid route parameter syntax in path "${path}": ${m}`);
      }
    }

    const bazaarConfig = config?.bazaar || config?.extensions?.['bazaar'];
    if (bazaarConfig?.input?.type === 'mcp' && !bazaarConfig.input.toolName) {
      errors.push(`Bazaar MCP route "${path}" missing required toolName`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Generates dynamic Bazaar discovery manifest (/discovery/bazaar.json)
 * enabling facilitators to catalog and index x402-enabled HTTP endpoints and MCP tools
 */
export function generateBazaarDiscoveryManifest(options: {
  origin: string;
  routes?: Record<string, any>;
  customTools?: any[];
}): BazaarDiscoveryManifest {
  const { origin, routes = {}, customTools = [] } = options;
  const manifest: BazaarDiscoveryManifest = {
    version: '2',
    timestamp: new Date().toISOString(),
    origin,
    catalogUrl: `${origin.replace(/\/+$/, '')}/.well-known/bazaar.json`,
    resources: [],
  };

  // 1. Index HTTP endpoints
  for (const [path, cfg] of Object.entries(routes)) {
    const bz = cfg?.bazaar || cfg?.extensions?.['bazaar'];
    if (bz) {
      if (bz.input?.type === 'mcp' || bz.toolName) {
        manifest.resources.push({
          type: 'mcp',
          toolName: bz.toolName || bz.input?.toolName,
          description: bz.description || bz.input?.description,
          inputSchema: bz.inputSchema || bz.input?.inputSchema || {},
          output: bz.output,
        });
      } else {
        manifest.resources.push({
          type: 'http',
          url: `${origin.replace(/\/+$/, '')}${path}`,
          method: (cfg.method || bz.input?.method || 'GET').toUpperCase(),
          inputSchema: bz.input?.bodySchema || bz.input?.queryParams || {},
          output: bz.output,
        });
      }
    }
  }

  // 2. Index MCP custom tools
  for (const tool of customTools) {
    if (tool && tool.name) {
      manifest.resources.push({
        type: 'mcp',
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || {},
        output: { type: 'application/json' },
      });
    }
  }

  return manifest;
}
