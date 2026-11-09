import {
  McpServer,
  fromJsonSchema,
  createMcpHandler,
  inputRequired,
  acceptedContent,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import { z } from 'zod';

export interface JSONRPCMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
import {
  OptimizeBasketSchema,
  AuthorizeEscrowOrderSchema,
  BroadcastSyntheticIntentSchema,
  VoidOrCaptureEscrowSchema,
  SubmitDisputeEvidenceSchema,
  ProposeDisputeSettlementSchema,
  toolHandlers,
} from './custom-tools.js';
import {
  executeACPAction,
  ACPMCPCreateCheckoutSessionSchema,
  ACPMCPGetCheckoutSessionSchema,
  ACPMCPUpdateCheckoutSessionSchema,
  ACPMCPCompleteCheckoutSessionSchema,
  ACPMCPCancelCheckoutSessionSchema,
} from './acp-manifest.js';
import {
  PayPalToolkitBridge,
  registerPayPalToolkitBridgeTools,
  type PayPalToolkitBridgeOptions,
} from './paypal-toolkit-bridge.js';

export interface MCPServerOptions {
  maxBufferSize?: number;
  maxToolInputElements?: number;
  redisClient?: any;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  enableToolkitBridge?: boolean;
  toolkitBridgeOptions?: PayPalToolkitBridgeOptions;
}

export const DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB default buffer limit

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export class McpError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * Standard MCP Schema Adapter.
 * Bridges Zod schemas (with custom refinements and type safety) and JSON Schema
 * representations required by MCP TypeScript SDK v2 tool discovery and execution.
 */
export function toMcpSchema<T = any>(
  zodSchema: z.ZodType<T>,
  jsonSchema: Record<string, any>
): any {
  const base = fromJsonSchema(jsonSchema as any);
  return {
    ...base,
    '~standard': {
      ...base['~standard'],
      validate(value: unknown) {
        const parsed = zodSchema.safeParse(value);
        if (parsed.success) {
          return { value: parsed.data };
        }
        return {
          issues: parsed.error.issues.map((i) => ({
            message: i.message,
            path: i.path,
          })),
        };
      },
    },
  };
}

/**
 * JSON Schema representations for the 11 registered AegisPay MCP tools.
 */
export const TOOL_JSON_SCHEMAS = {
  optimize_channel3_multi_merchant_basket: {
    type: 'object',
    properties: {
      allowance_voucher_id: { type: 'string' },
      search_query: { type: 'string' },
      category_ids: { type: 'array', items: { type: 'string' } },
      hex_color: { type: 'string' },
      image_url: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            merchant_domain: { type: 'string' },
            price_cents: { type: 'number' },
            quantity: { type: 'number' },
          },
          required: ['product_id', 'merchant_domain', 'price_cents'],
        },
      },
    },
    required: ['allowance_voucher_id'],
  },
  authorize_conditional_escrow_order: {
    type: 'object',
    properties: {
      mandate_id: { type: 'string' },
      merchant_domain: { type: 'string' },
      requested_cents: { type: 'number' },
      category_id: { type: 'string' },
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
      requires_3ds: { type: 'boolean' },
      confirmed: { type: 'boolean' },
    },
    required: ['mandate_id', 'merchant_domain', 'requested_cents', 'category_id', 'items'],
  },
  broadcast_synthetic_intent_voucher: {
    type: 'object',
    properties: {
      mandate_id: { type: 'string' },
      channel3_product_id: { type: 'string' },
      merchant_domain: { type: 'string' },
      retail_offer_cents: { type: 'number' },
      buyer_bid_cents: { type: 'number' },
    },
    required: ['mandate_id', 'channel3_product_id', 'merchant_domain', 'retail_offer_cents', 'buyer_bid_cents'],
  },
  void_or_capture_escrow_hold: {
    type: 'object',
    properties: {
      authorization_id: { type: 'string' },
      action: { type: 'string', enum: ['CAPTURE', 'VOID'] },
      amount_cents: { type: 'number' },
    },
    required: ['authorization_id', 'action'],
  },
  submit_dispute_evidence_bundle: {
    type: 'object',
    properties: {
      paypal_dispute_id: { type: 'string' },
      carrier_tracking_number: { type: 'string' },
      policy_proof_text: { type: 'string' },
      vision_defect_mask: { type: 'array', items: { type: 'number' } },
    },
    required: ['paypal_dispute_id'],
  },
  propose_dispute_partial_settlement: {
    type: 'object',
    properties: {
      paypal_dispute_id: { type: 'string' },
      compromise_amount_cents: { type: 'number' },
    },
    required: ['paypal_dispute_id', 'compromise_amount_cents'],
  },
  create_checkout_session: {
    type: 'object',
    properties: {
      meta: { type: 'object' },
      payload: { type: 'object' },
    },
    required: ['meta', 'payload'],
  },
  get_checkout_session: {
    type: 'object',
    properties: {
      meta: { type: 'object' },
      id: { type: 'string' },
    },
    required: ['meta', 'id'],
  },
  update_checkout_session: {
    type: 'object',
    properties: {
      meta: { type: 'object' },
      id: { type: 'string' },
      payload: { type: 'object' },
    },
    required: ['meta', 'id', 'payload'],
  },
  complete_checkout_session: {
    type: 'object',
    properties: {
      meta: { type: 'object' },
      id: { type: 'string' },
      payload: { type: 'object' },
    },
    required: ['meta', 'id', 'payload'],
  },
  cancel_checkout_session: {
    type: 'object',
    properties: {
      meta: { type: 'object' },
      id: { type: 'string' },
      payload: { type: 'object' },
    },
    required: ['meta', 'id'],
  },
};

/**
 * Zod Output Schemas for structured content validation
 */
export const OutputSchemas = {
  optimizeBasket: z.object({
    basket_total_cents: z.number(),
    assignments: z.array(z.object({
      merchant_domain: z.string(),
      items: z.array(z.any()),
    })),
    net_buyer_expenditure_cents: z.number(),
  }),
  authorizeEscrow: z.object({
    paypal_order_id: z.string(),
    invoice_id: z.string(),
    status: z.string(),
    spent_cents: z.number().optional(),
    merchant_anomaly_score: z.number().optional(),
    audit_hash: z.string().optional(),
  }),
  broadcastIntent: z.object({
    voucher_id: z.string(),
    setup_token_id: z.string(),
    status: z.string(),
  }),
  voidOrCapture: z.object({
    status: z.string(),
    transaction_id: z.string(),
  }),
  submitEvidence: z.object({
    status: z.string(),
    evidence_id: z.string().optional(),
  }),
  proposeSettlement: z.object({
    status: z.string(),
    offer_id: z.string().optional(),
  }),
  acpSession: z.object({
    id: z.string(),
    status: z.string(),
    currency: z.string().optional(),
    line_items: z.array(z.any()).optional(),
    totals: z.array(z.any()).optional(),
  }).passthrough(),
};

/**
 * Hardened Stdio Server Transport for MCP JSON-RPC 2.0.
 * Maintained for backwards compatibility and specialized high-throughput streams.
 */
export class HardenedStdioServerTransport {
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
      // stdout write error handled silently
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
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

/**
 * Factory creating high-level McpServer instance with all 11 AegisPay tools registered.
 * Implements MCP TypeScript SDK v2 specification and 2026-07-28 protocol revision.
 */
export function createMCPServer(options: MCPServerOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: 'aegispay-mcp-enforcer',
      version: '0.2.0',
    },
    {
      instructions: 'AegisPay Autonomous Clearinghouse & Interoperability Gateway MCP Enforcer',
    }
  );

  // 1. optimize_channel3_multi_merchant_basket
  server.registerTool(
    'optimize_channel3_multi_merchant_basket',
    {
      description: 'Runs the commission-subsidized knapsack solver across Channel3 offers.',
      inputSchema: toMcpSchema(OptimizeBasketSchema, TOOL_JSON_SCHEMAS.optimize_channel3_multi_merchant_basket),
      outputSchema: toMcpSchema(OutputSchemas.optimizeBasket, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await toolHandlers.handleOptimizeBasket(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 2. authorize_conditional_escrow_order
  const EscrowApprovalSchema = z.object({
    approved: z.boolean(),
    operator_id: z.string().optional(),
    challenge_token: z.string().optional(),
  });
  const EscrowApprovalJsonSchema = {
    type: 'object',
    properties: {
      approved: { type: 'boolean' },
      operator_id: { type: 'string' },
      challenge_token: { type: 'string' },
    },
    required: ['approved'],
  };
  const EscrowApprovalMcpSchema = toMcpSchema(EscrowApprovalSchema, EscrowApprovalJsonSchema);

  server.registerTool(
    'authorize_conditional_escrow_order',
    {
      description: 'Verifies the Ed25519 signature + Redis Lua atomic reservation, creates a multi-unit PayPal v2 Order.',
      inputSchema: toMcpSchema(AuthorizeEscrowOrderSchema, TOOL_JSON_SCHEMAS.authorize_conditional_escrow_order),
      outputSchema: toMcpSchema(OutputSchemas.authorizeEscrow, { type: 'object' }),
    },
    async (args: any, ctx) => {
      // Human-in-the-loop elicitation (SDK v2 2026-07-28 input_required)
      // High-stakes operations exceeding $500 (50,000 cents) or requiring 3DS challenge
      const accepted = acceptedContent(ctx?.mcpReq?.inputResponses, 'approval', EscrowApprovalSchema);
      const isApproved = accepted?.approved === true || args.confirmed === true;

      if ((args.requested_cents > 50000 || args.requires_3ds === true) && !isApproved) {
        return inputRequired({
          inputRequests: {
            approval: inputRequired.elicit({
              message: `High-value escrow authorization ($${(args.requested_cents / 100).toFixed(2)}) requires buyer/operator approval or 3DS step-up.`,
              requestedSchema: EscrowApprovalMcpSchema,
            }),
          },
        });
      }

      // Check abort signal from caller/HTTP stream
      if (ctx?.mcpReq?.signal?.aborted) {
        throw new McpError(ErrorCode.InternalError, 'Escrow authorization aborted by client disconnect');
      }

      const result = await toolHandlers.handleAuthorizeEscrow({
        ...args,
        redis_client: args.redis_client || options.redisClient,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 3. broadcast_synthetic_intent_voucher
  server.registerTool(
    'broadcast_synthetic_intent_voucher',
    {
      description: 'Creates a PayPal Vault v3 setup token and broadcasts a binding below-retail bid.',
      inputSchema: toMcpSchema(BroadcastSyntheticIntentSchema, TOOL_JSON_SCHEMAS.broadcast_synthetic_intent_voucher),
      outputSchema: toMcpSchema(OutputSchemas.broadcastIntent, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await toolHandlers.handleBroadcastIntent(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 4. void_or_capture_escrow_hold
  server.registerTool(
    'void_or_capture_escrow_hold',
    {
      description: 'Executes POST /v2/payments/authorizations/{id}/capture or void.',
      inputSchema: toMcpSchema(VoidOrCaptureEscrowSchema, TOOL_JSON_SCHEMAS.void_or_capture_escrow_hold),
      outputSchema: toMcpSchema(OutputSchemas.voidOrCapture, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await toolHandlers.handleVoidOrCapture(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 5. submit_dispute_evidence_bundle
  server.registerTool(
    'submit_dispute_evidence_bundle',
    {
      description: 'Compiles carrier tracking, vision defect masks, and policy proofs into an in-memory PDF.',
      inputSchema: toMcpSchema(SubmitDisputeEvidenceSchema, TOOL_JSON_SCHEMAS.submit_dispute_evidence_bundle),
      outputSchema: toMcpSchema(OutputSchemas.submitEvidence, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await toolHandlers.handleSubmitEvidence(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 6. propose_dispute_partial_settlement
  server.registerTool(
    'propose_dispute_partial_settlement',
    {
      description: 'Executes POST /v1/customer/disputes/{id}/make-offer with calculated partial compromise amounts.',
      inputSchema: toMcpSchema(ProposeDisputeSettlementSchema, TOOL_JSON_SCHEMAS.propose_dispute_partial_settlement),
      outputSchema: toMcpSchema(OutputSchemas.proposeSettlement, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await toolHandlers.handleProposeSettlement(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // 7. create_checkout_session
  server.registerTool(
    'create_checkout_session',
    {
      description: 'ACP MCP Tool: Creates an agentic checkout session with optional affiliate attribution and item validations.',
      inputSchema: toMcpSchema(ACPMCPCreateCheckoutSessionSchema, TOOL_JSON_SCHEMAS.create_checkout_session),
      outputSchema: toMcpSchema(OutputSchemas.acpSession, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await executeACPAction('create_checkout_session', args || {});
      const session = result.result || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(session) }],
        structuredContent: session,
      };
    }
  );

  // 8. get_checkout_session
  server.registerTool(
    'get_checkout_session',
    {
      description: 'ACP MCP Tool: Retrieves active checkout session state and pricing lines.',
      inputSchema: toMcpSchema(ACPMCPGetCheckoutSessionSchema, TOOL_JSON_SCHEMAS.get_checkout_session),
      outputSchema: toMcpSchema(OutputSchemas.acpSession, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await executeACPAction('get_checkout_session', args || {});
      const session = result.result || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(session) }],
        structuredContent: session,
      };
    }
  );

  // 9. update_checkout_session
  server.registerTool(
    'update_checkout_session',
    {
      description: 'ACP MCP Tool: Updates items, buyer info, or fulfillment on an active checkout session.',
      inputSchema: toMcpSchema(ACPMCPUpdateCheckoutSessionSchema, TOOL_JSON_SCHEMAS.update_checkout_session),
      outputSchema: toMcpSchema(OutputSchemas.acpSession, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await executeACPAction('update_checkout_session', args || {});
      const session = result.result || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(session) }],
        structuredContent: session,
      };
    }
  );

  // 10. complete_checkout_session
  server.registerTool(
    'complete_checkout_session',
    {
      description: 'ACP MCP Tool: Executes payment and captures the checkout session order.',
      inputSchema: toMcpSchema(ACPMCPCompleteCheckoutSessionSchema, TOOL_JSON_SCHEMAS.complete_checkout_session),
      outputSchema: toMcpSchema(OutputSchemas.acpSession, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await executeACPAction('complete_checkout_session', args || {});
      const session = result.result || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(session) }],
        structuredContent: session,
      };
    }
  );

  // 11. cancel_checkout_session
  server.registerTool(
    'cancel_checkout_session',
    {
      description: 'ACP MCP Tool: Cancels an active checkout session with optional intent trace.',
      inputSchema: toMcpSchema(ACPMCPCancelCheckoutSessionSchema, TOOL_JSON_SCHEMAS.cancel_checkout_session),
      outputSchema: toMcpSchema(OutputSchemas.acpSession, { type: 'object' }),
    },
    async (args: any, _ctx) => {
      const result = await executeACPAction('cancel_checkout_session', args || {});
      const session = result.result || result;
      return {
        content: [{ type: 'text', text: JSON.stringify(session) }],
        structuredContent: session,
      };
    }
  );

  // Optional: Official PayPal Agent Toolkit Bridge Tools
  if (options.enableToolkitBridge) {
    const bridge = new PayPalToolkitBridge({
      ...options.toolkitBridgeOptions,
      redisClient: options.redisClient ?? options.toolkitBridgeOptions?.redisClient,
    });
    registerPayPalToolkitBridgeTools(server, bridge);
  }

  return server;
}

export {
  PayPalToolkitBridge,
  registerPayPalToolkitBridgeTools,
  type PayPalToolkitBridgeOptions,
};

/**
 * Server factory helper for per-request stateless web serving
 */
export const createServerFactory = (options: MCPServerOptions = {}) => {
  return () => createMCPServer(options);
};

/**
 * Standard MCP HTTP Handler for web integration
 */
export function createAegispayMcpHandler(options: MCPServerOptions = {}) {
  return createMcpHandler(createServerFactory(options));
}

/**
 * Runs the MCP server with Stdio transport
 */
export async function runServer(options: MCPServerOptions = {}) {
  const server = createMCPServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AegisPay MCP Enforcer Server v0.2.0 running on native SDK v2 stdio transport');
}

/**
 * Standard CLI stdio runner
 */
export async function serveStdio(
  serverFactory: () => McpServer = () => createMCPServer(),
  _options: MCPServerOptions = {}
) {
  const server = serverFactory();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AegisPay MCP Enforcer Server running via serveStdio');
}
