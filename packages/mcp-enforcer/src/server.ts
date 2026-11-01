import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  OptimizeBasketSchema,
  AuthorizeEscrowOrderSchema,
  BroadcastSyntheticIntentSchema,
  VoidOrCaptureEscrowSchema,
  SubmitDisputeEvidenceSchema,
  ProposeDisputeSettlementSchema,
  toolHandlers
} from './custom-tools.js';

export function createMCPServer() {
  const server = new Server(
    {
      name: 'aegispay-mcp-enforcer',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'optimize_channel3_multi_merchant_basket',
          description: 'Runs the commission-subsidized knapsack solver across Channel3 offers.',
          inputSchema: {
            type: 'object',
            properties: {
              allowance_voucher_id: { type: 'string' },
              search_query: { type: 'string' },
              category_ids: { type: 'array', items: { type: 'string' } },
              hex_color: { type: 'string' },
              image_url: { type: 'string' }
            },
            required: ['allowance_voucher_id']
          },
        },
        {
          name: 'authorize_conditional_escrow_order',
          description: 'Verifies the Ed25519 signature + Redis Lua atomic reservation, creates a multi-unit PayPal v2 Order.',
          inputSchema: {
            type: 'object',
            properties: {
              mandate_id: { type: 'string' },
              merchant_domain: { type: 'string' },
              requested_cents: { type: 'number' },
              category_id: { type: 'string' },
              items: { type: 'array' }
            },
            required: ['mandate_id', 'merchant_domain', 'requested_cents', 'category_id', 'items']
          },
        },
        {
          name: 'broadcast_synthetic_intent_voucher',
          description: 'Creates a PayPal Vault v3 setup token and broadcasts a binding below-retail bid.',
          inputSchema: {
            type: 'object',
            properties: {
              mandate_id: { type: 'string' },
              channel3_product_id: { type: 'string' },
              merchant_domain: { type: 'string' },
              retail_offer_cents: { type: 'number' },
              buyer_bid_cents: { type: 'number' }
            },
            required: ['mandate_id', 'channel3_product_id', 'merchant_domain', 'retail_offer_cents', 'buyer_bid_cents']
          }
        },
        {
          name: 'void_or_capture_escrow_hold',
          description: 'Executes POST /v2/payments/authorizations/{id}/capture or void.',
          inputSchema: {
            type: 'object',
            properties: {
              authorization_id: { type: 'string' },
              action: { type: 'string', enum: ['CAPTURE', 'VOID'] },
              amount_cents: { type: 'number' }
            },
            required: ['authorization_id', 'action']
          }
        },
        {
          name: 'submit_dispute_evidence_bundle',
          description: 'Compiles carrier tracking, vision defect masks, and policy proofs into an in-memory PDF.',
          inputSchema: {
            type: 'object',
            properties: {
              paypal_dispute_id: { type: 'string' },
              carrier_tracking_number: { type: 'string' },
              policy_proof_text: { type: 'string' },
              vision_defect_mask: { type: 'array' }
            },
            required: ['paypal_dispute_id']
          }
        },
        {
          name: 'propose_dispute_partial_settlement',
          description: 'Executes POST /v1/customer/disputes/{id}/make-offer with calculated partial compromise amounts.',
          inputSchema: {
            type: 'object',
            properties: {
              paypal_dispute_id: { type: 'string' },
              compromise_amount_cents: { type: 'number' }
            },
            required: ['paypal_dispute_id', 'compromise_amount_cents']
          }
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case 'optimize_channel3_multi_merchant_basket': {
        const parsed = OptimizeBasketSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleOptimizeBasket(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'authorize_conditional_escrow_order': {
        const parsed = AuthorizeEscrowOrderSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleAuthorizeEscrow(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'broadcast_synthetic_intent_voucher': {
        const parsed = BroadcastSyntheticIntentSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleBroadcastIntent(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'void_or_capture_escrow_hold': {
        const parsed = VoidOrCaptureEscrowSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleVoidOrCapture(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'submit_dispute_evidence_bundle': {
        const parsed = SubmitDisputeEvidenceSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleSubmitEvidence(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'propose_dispute_partial_settlement': {
        const parsed = ProposeDisputeSettlementSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleProposeSettlement(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      default:
        throw new Error('Unknown tool');
    }
  });

  return server;
}

export async function runServer() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Enforcer Server running on stdio');
}
