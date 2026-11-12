import { useMemo, useRef } from 'react';
import { useLocalRuntime } from '@assistant-ui/react';
import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
  TextMessagePart,
} from '@assistant-ui/react';
import type {
  ConversationalChatPayload,
  ActiveTurnProduct,
  ProductCardData,
  ComparisonMatrix,
} from '@aegispay/shared-types';
import { webLogger as logger } from '@/lib/logger';

// --- Vercel AI SDK Data Stream Protocol Types ---

export interface DataStreamTextFrame {
  type: 'text';
  value: string;
}

export interface DataStreamToolCallFrame {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface DataStreamToolResultFrame {
  type: 'tool-result';
  toolCallId: string;
  result: unknown;
}

export interface DataStreamFinishFrame {
  type: 'finish';
  finishReason?: string;
  usage?: Record<string, unknown>;
}

export interface DataStreamErrorFrame {
  type: 'error';
  error: string;
}

export type DataStreamFrame =
  | DataStreamTextFrame
  | DataStreamToolCallFrame
  | DataStreamToolResultFrame
  | DataStreamFinishFrame
  | DataStreamErrorFrame;

/**
 * Parses a single wire protocol line according to the Vercel AI SDK Data Stream Protocol.
 * Supported frame prefixes:
 * - 0: Text token delta
 * - 9: Tool call
 * - a: Tool call result
 * - d: Step finish metadata
 * - 3: Stream error message
 */
export function parseDataStreamLine(line: string): DataStreamFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return null;

  const prefix = trimmed.slice(0, colonIdx);
  const rawPayload = trimmed.slice(colonIdx + 1);

  try {
    const parsed = JSON.parse(rawPayload);

    switch (prefix) {
      case '0':
        return {
          type: 'text',
          value: typeof parsed === 'string' ? parsed : String(parsed),
        };
      case '9':
        return {
          type: 'tool-call',
          toolCallId: parsed.toolCallId || `tc_${Date.now()}`,
          toolName: parsed.toolName || 'unknown',
          args: parsed.args || {},
        };
      case 'a':
        return {
          type: 'tool-result',
          toolCallId: parsed.toolCallId || '',
          result: parsed.result,
        };
      case 'd':
        return {
          type: 'finish',
          finishReason: parsed.finishReason,
          usage: parsed.usage,
        };
      case '3':
        return {
          type: 'error',
          error: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
        };
      default:
        logger.debug('[DataStream:Parse] Unrecognized protocol line prefix', { prefix, rawPayload });
        return null;
    }
  } catch (err: any) {
    logger.warn('[DataStream:Parse] Failed to JSON-parse stream line payload', {
      prefix,
      rawPayload,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Incremental stream decoder that reads raw Uint8Array bytes from an HTTP response,
 * reconstructs complete protocol lines across chunk boundaries, and yields DataStreamFrames.
 */
export async function* decodeDataStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<DataStreamFrame, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const frame = parseDataStreamLine(line);
        if (frame) {
          yield frame;
        }
      }
    }

    // Flush any remaining line in buffer
    if (buffer.trim()) {
      const frame = parseDataStreamLine(buffer);
      if (frame) {
        yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Shopping Assistant Runtime Options & Adapter ---

export interface ShoppingAssistantRuntimeOptions {
  apiEndpoint?: string;
  sessionId?: string;
  getActiveTurnProducts?: () => ActiveTurnProduct[];
  getSelectedProductIds?: () => string[];
  budgetCapCents?: number;
  zipCode?: string;
  developerModeEnabled?: boolean;
  selectedModel?: string;
  userApiKey?: string;
  allowedCategories?: string[];
  allowedMerchants?: string[];
  onTurnProductsReceived?: (products: ProductCardData[]) => void;
  onCartReceived?: (cart: any) => void;
  onComparisonReceived?: (comparison: ComparisonMatrix) => void;
  onError?: (err: Error) => void;
  initialMessages?: any[];
}

/**
 * Extracts plain text from an assistant-ui ThreadMessage.
 */
function extractMessageContent(message: ThreadMessage): string {
  if (!message || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((p): p is TextMessagePart => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
  }
  return '';
}

/**
 * Creates an assistant-ui ChatModelAdapter that connects to Fastify SSE streaming endpoint,
 * handles turn-bound context, parses Data Stream protocol frames, and populates tool call parts.
 */
export function createDataStreamChatAdapter(options: ShoppingAssistantRuntimeOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const latestText = lastUserMsg ? extractMessageContent(lastUserMsg) : '';

      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: extractMessageContent(m),
      }));

      const activeTurnProducts = options.getActiveTurnProducts ? options.getActiveTurnProducts() : [];
      const selectedProductIds = options.getSelectedProductIds ? options.getSelectedProductIds() : [];

      const payload: ConversationalChatPayload = {
        session_id: options.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        message: latestText,
        history,
        selected_product_ids: selectedProductIds,
        product_ids: selectedProductIds,
        active_turn_products: activeTurnProducts,
        budget_cap_cents: options.budgetCapCents,
        zip_code: options.zipCode,
        allowed_category_ids: options.allowedCategories,
        allowed_merchants: options.allowedMerchants,
        stream: true,
      };

      const endpoint = options.apiEndpoint || '/api/buyer/chat';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'x-vercel-ai-data-stream': 'v1',
      };

      if (options.developerModeEnabled && options.userApiKey && options.userApiKey.trim()) {
        headers['x-user-llm-api-key'] = options.userApiKey.trim();
      }

      if (options.allowedCategories && options.allowedCategories.length > 0) {
        headers['x-allowed-categories'] = options.allowedCategories.join(',');
      }

      if (options.allowedMerchants && options.allowedMerchants.length > 0) {
        headers['x-allowed-merchants'] = options.allowedMerchants.join(',');
      }

      logger.info('[AssistantUi:Run] Dispatching streaming chat request', {
        endpoint,
        messageLength: latestText.length,
        selectedProductIdsCount: selectedProductIds.length,
        activeTurnProductsCount: activeTurnProducts.length,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let userMessage = `Unable to complete chat request (HTTP ${response.status}).`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed?.error) userMessage = parsed.error;
          else if (parsed?.message) userMessage = parsed.message;
        } catch {}
        const err = new Error(userMessage);
        logger.error('[AssistantUi:Run] HTTP error from chat endpoint', { status: response.status, errorText });
        if (options.onError) options.onError(err);
        yield {
          content: [
            {
              type: 'text',
              text: `⚠️ **Notice:** ${userMessage}\n\n*Please try searching for products or clicking a suggestion below.*`,
            },
          ],
        };
        return;
      }

      if (!response.body) {
        logger.warn('[AssistantUi:Run] Response body is empty; closing turn without parts');
        return;
      }

      let accumulatedText = '';
      const toolCallsMap = new Map<
        string,
        {
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
          result?: unknown;
        }
      >();

      for await (const frame of decodeDataStream(response.body)) {
        if (frame.type === 'text') {
          accumulatedText += frame.value;
        } else if (frame.type === 'tool-call') {
          logger.debug('[AssistantUi:Stream] Tool call frame received', {
            toolCallId: frame.toolCallId,
            toolName: frame.toolName,
          });
          toolCallsMap.set(frame.toolCallId, {
            toolCallId: frame.toolCallId,
            toolName: frame.toolName,
            args: frame.args,
          });
        } else if (frame.type === 'tool-result') {
          logger.debug('[AssistantUi:Stream] Tool result frame received', {
            toolCallId: frame.toolCallId,
          });
          const existing = toolCallsMap.get(frame.toolCallId);
          if (existing) {
            existing.result = frame.result;
          } else {
            toolCallsMap.set(frame.toolCallId, {
              toolCallId: frame.toolCallId,
              toolName: 'unknown',
              args: {},
              result: frame.result,
            });
          }

          // Propagate structured data callbacks
          const resObj = frame.result as any;
          if (resObj?.products && Array.isArray(resObj.products) && options.onTurnProductsReceived) {
            options.onTurnProductsReceived(resObj.products);
          }
          if (resObj?.cart && options.onCartReceived) {
            options.onCartReceived(resObj.cart);
          }
          if (resObj?.comparison && options.onComparisonReceived) {
            options.onComparisonReceived(resObj.comparison);
          }
        } else if (frame.type === 'error') {
          const streamErr = new Error(frame.error);
          logger.error('[AssistantUi:Stream] Protocol error frame received', { error: frame.error });
          if (options.onError) options.onError(streamErr);
          accumulatedText += (accumulatedText ? '\n\n' : '') + `⚠️ **Notice:** ${frame.error}`;
        }

        // Build composite content parts for assistant-ui
        const contentParts: ThreadAssistantMessagePart[] = [];
        if (accumulatedText) {
          contentParts.push({
            type: 'text',
            text: accumulatedText,
          });
        }

        for (const tc of toolCallsMap.values()) {
          contentParts.push({
            type: 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args as any,
            argsText: JSON.stringify(tc.args),
            result: tc.result,
            status: {
              type: tc.result !== undefined ? 'complete' : 'running',
            } as any,
          });
        }

        yield {
          content: contentParts,
        };
      }
    },
  };
}

/**
 * React hook to initialize and memoize the Assistant UI shopping concierge runtime.
 * Maintains stable adapter and runtimeOptions references to prevent thread list teardowns across re-renders.
 */
export function useShoppingAssistantRuntime(options: ShoppingAssistantRuntimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stable adapter that delegates execution to the latest optionsRef.current without recreating the runtime
  const adapter = useMemo<ChatModelAdapter>(() => {
    return {
      async *run(args) {
        const delegate = createDataStreamChatAdapter(optionsRef.current);
        const result = delegate.run(args);
        if (result && Symbol.asyncIterator in result) {
          yield* result as any;
        } else {
          yield await (result as any);
        }
      },
    };
  }, []);

  const defaultGreeting = useMemo(
    () => [
      {
        id: 'init_greeting',
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: options.developerModeEnabled
              ? 'Hello! I am your AegisPay Shopping Concierge. I can discover products across Channel3 merchants, compare specs side-by-side, calculate instant commission rebates, and verify stock with 2PC inventory holds before you purchase.'
              : 'Hello! I am your AegisPay Shopping Assistant. I can discover products across verified stores, compare features side-by-side, calculate instant cashback savings, and verify live stock before you purchase.',
          },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.developerModeEnabled]
  );

  const initialMessages = useMemo(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      return options.initialMessages.map((m, idx) => ({
        ...m,
        id: m.id || `init_msg_${idx}`,
      }));
    }
    return defaultGreeting;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runtimeOptions = useMemo(
    () => ({
      initialMessages,
    }),
    [initialMessages]
  );

  return useLocalRuntime(adapter, runtimeOptions);
}
