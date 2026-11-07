import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  JSONRPCMessageSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  OptimizeBasketSchema,
  AuthorizeEscrowOrderSchema,
  BroadcastSyntheticIntentSchema,
  VoidOrCaptureEscrowSchema,
  SubmitDisputeEvidenceSchema,
  ProposeDisputeSettlementSchema,
  toolHandlers
} from './custom-tools.js';
import { executeACPAction } from './acp-manifest.js';

export interface MCPServerOptions {
  maxBufferSize?: number;
  maxToolInputElements?: number;
}

export const DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB default buffer limit

/**
 * Hardened Stdio Server Transport for MCP JSON-RPC 2.0.
 * Protects against:
 * - Buffer overflows (configurable maxBufferSize)
 * - Malformed stdio messages / parse errors (returns JSON-RPC -32700 Parse Error)
 * - Invalid JSON-RPC protocol structures (returns JSON-RPC -32600 Invalid Request)
 */
export class HardenedStdioServerTransport implements Transport {
  private _stdin: NodeJS.ReadableStream;
  private _stdout: NodeJS.WritableStream;
  private _maxBufferSize: number;
  private _buffer: Buffer | null = null;
  private _started = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    stdin: NodeJS.ReadableStream = process.stdin,
    stdout: NodeJS.WritableStream = process.stdout,
    options?: { maxBufferSize?: number }
  ) {
    this._stdin = stdin;
    this._stdout = stdout;
    this._maxBufferSize = options?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('HardenedStdioServerTransport already started!');
    }
    this._started = true;

    this._stdin.on('data', this._handleData);
    this._stdin.on('error', this._handleError);
  }

  private _handleError = (error: Error) => {
    this.onerror?.(error);
  };

  private _handleData = (chunk: Buffer) => {
    const currentSize = this._buffer ? this._buffer.length : 0;
    const newSize = currentSize + chunk.length;

    if (newSize > this._maxBufferSize) {
      this._buffer = null;
      const overflowError = new McpError(
        ErrorCode.ParseError,
        `ReadBuffer exceeded maximum size of ${this._maxBufferSize} bytes`
      );
      this._sendProtocolError(null, ErrorCode.ParseError, overflowError.message);
      this.onerror?.(overflowError);
      return;
    }

    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
    this._processBuffer();
  };

  private _processBuffer(): void {
    while (this._buffer) {
      const newlineIndex = this._buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }

      const rawLine = this._buffer.toString('utf8', 0, newlineIndex).replace(/\r$/, '');
      this._buffer = this._buffer.subarray(newlineIndex + 1);

      if (rawLine.trim().length === 0) {
        continue;
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(rawLine);
      } catch (err: any) {
        this._sendProtocolError(null, ErrorCode.ParseError, `Parse error: ${err.message || 'Invalid JSON'}`);
        this.onerror?.(new McpError(ErrorCode.ParseError, `Parse error: ${err.message}`));
        continue;
      }

      const validated = JSONRPCMessageSchema.safeParse(parsedJson);
      if (!validated.success) {
        const id = (parsedJson && typeof parsedJson === 'object' && 'id' in parsedJson)
          ? parsedJson.id
          : null;
        this._sendProtocolError(id, ErrorCode.InvalidRequest, 'Invalid Request: not a valid JSON-RPC 2.0 message');
        this.onerror?.(new McpError(ErrorCode.InvalidRequest, 'Invalid Request'));
        continue;
      }

      try {
        this.onmessage?.(validated.data as JSONRPCMessage);
      } catch (err: any) {
        this.onerror?.(err);
      }
    }
  }

  private _sendProtocolError(id: string | number | null, code: number, message: string): void {
    const errorResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
      },
    };
    try {
      this._stdout.write(JSON.stringify(errorResponse) + '\n');
    } catch {
      // stdout write error handled silently or via stderr
    }
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return new Promise((resolve) => {
      const json = JSON.stringify(message) + '\n';
      if ((this._stdout as any).write(json)) {
        resolve();
      } else {
        (this._stdout as any).once('drain', resolve);
      }
    });
  }

  async close(): Promise<void> {
    this._stdin.off('data', this._handleData);
    this._stdin.off('error', this._handleError);
    this._buffer = null;
    this.onclose?.();
  }
}

export function createMCPServer(options: MCPServerOptions = {}) {
  const server = new Server(
    {
      name: 'aegispay-mcp-enforcer',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: 'AegisPay Autonomous Clearinghouse & Interoperability Gateway MCP Enforcer',
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
        },
        {
          name: 'create_checkout_session',
          description: 'ACP MCP Tool: Creates an agentic checkout session with optional affiliate attribution and item validations.',
          inputSchema: {
            type: 'object',
            properties: {
              meta: { type: 'object' },
              payload: { type: 'object' }
            },
            required: ['meta', 'payload']
          }
        },
        {
          name: 'get_checkout_session',
          description: 'ACP MCP Tool: Retrieves active checkout session state and pricing lines.',
          inputSchema: {
            type: 'object',
            properties: {
              meta: { type: 'object' },
              id: { type: 'string' }
            },
            required: ['meta', 'id']
          }
        },
        {
          name: 'update_checkout_session',
          description: 'ACP MCP Tool: Updates items, buyer info, or fulfillment on an active checkout session.',
          inputSchema: {
            type: 'object',
            properties: {
              meta: { type: 'object' },
              id: { type: 'string' },
              payload: { type: 'object' }
            },
            required: ['meta', 'id', 'payload']
          }
        },
        {
          name: 'complete_checkout_session',
          description: 'ACP MCP Tool: Executes payment and captures the checkout session order.',
          inputSchema: {
            type: 'object',
            properties: {
              meta: { type: 'object' },
              id: { type: 'string' },
              payload: { type: 'object' }
            },
            required: ['meta', 'id', 'payload']
          }
        },
        {
          name: 'cancel_checkout_session',
          description: 'ACP MCP Tool: Cancels an active checkout session with optional intent trace.',
          inputSchema: {
            type: 'object',
            properties: {
              meta: { type: 'object' },
              id: { type: 'string' },
              payload: { type: 'object' }
            },
            required: ['meta', 'id']
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
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleOptimizeBasket(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'authorize_conditional_escrow_order': {
        const parsed = AuthorizeEscrowOrderSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleAuthorizeEscrow(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'broadcast_synthetic_intent_voucher': {
        const parsed = BroadcastSyntheticIntentSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleBroadcastIntent(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'void_or_capture_escrow_hold': {
        const parsed = VoidOrCaptureEscrowSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleVoidOrCapture(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'submit_dispute_evidence_bundle': {
        const parsed = SubmitDisputeEvidenceSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleSubmitEvidence(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'propose_dispute_partial_settlement': {
        const parsed = ProposeDisputeSettlementSchema.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${parsed.error}`);
        }
        const result = await toolHandlers.handleProposeSettlement(parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'create_checkout_session': {
        try {
          const result = await executeACPAction('create_checkout_session', request.params.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result.result || result) }] };
        } catch (err: any) {
          if (err.code === -32602 || err.name === 'ACPValidationError') {
            throw new McpError(ErrorCode.InvalidParams, err.message, err.data);
          }
          throw err;
        }
      }
      case 'get_checkout_session': {
        try {
          const result = await executeACPAction('get_checkout_session', request.params.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result.result || result) }] };
        } catch (err: any) {
          if (err.code === -32602 || err.name === 'ACPValidationError') {
            throw new McpError(ErrorCode.InvalidParams, err.message, err.data);
          }
          throw err;
        }
      }
      case 'update_checkout_session': {
        try {
          const result = await executeACPAction('update_checkout_session', request.params.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result.result || result) }] };
        } catch (err: any) {
          if (err.code === -32602 || err.name === 'ACPValidationError') {
            throw new McpError(ErrorCode.InvalidParams, err.message, err.data);
          }
          throw err;
        }
      }
      case 'complete_checkout_session': {
        try {
          const result = await executeACPAction('complete_checkout_session', request.params.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result.result || result) }] };
        } catch (err: any) {
          if (err.code === -32602 || err.name === 'ACPValidationError') {
            throw new McpError(ErrorCode.InvalidParams, err.message, err.data);
          }
          throw err;
        }
      }
      case 'cancel_checkout_session': {
        try {
          const result = await executeACPAction('cancel_checkout_session', request.params.arguments || {});
          return { content: [{ type: 'text', text: JSON.stringify(result.result || result) }] };
        } catch (err: any) {
          if (err.code === -32602 || err.name === 'ACPValidationError') {
            throw new McpError(ErrorCode.InvalidParams, err.message, err.data);
          }
          throw err;
        }
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
    }
  });

  return server;
}

export async function runServer(options: MCPServerOptions = {}) {
  const server = createMCPServer(options);
  const transport = new HardenedStdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
  });
  await server.connect(transport);
  console.error('MCP Enforcer Server running on hardened stdio transport');
}
