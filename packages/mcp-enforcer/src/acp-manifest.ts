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
 */

export interface ACPManifest {
  schema_version: 'v1';
  name_for_model: 'aegispay_agentic_commerce';
  name_for_human: 'AegisPay Autonomous Clearinghouse & Interoperability Gateway';
  description_for_model: 'Standardized OpenAI Agentic Commerce Protocol (ACP) adapter bridging autonomous discovery, quotes, and conditional payment holds to AegisPay Ed25519-signed spend mandates and PayPal v2/v3 rails.';
  description_for_human: 'Autonomous agentic commerce protocol gateway providing discover_products, request_purchase_quote, and confirm_payment_hold tools guarded by atomic Redis Lua spend enforcement.';
  protocol: 'OPENAI_ACP_v1';
  contact_email: 'security@aegispay.dev';
  legal_info_url: 'https://aegispay.dev/legal';
  actions: ACPActionDescriptor[];
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
