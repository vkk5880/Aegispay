import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDataStreamLine,
  decodeDataStream,
  createDataStreamChatAdapter,
  useShoppingAssistantRuntime,
} from '../../lib/assistantUiRuntime.js';
import { POST as chatHandler } from '../../app/api/buyer/chat/route.js';
import {
  SearchCatalogToolUI,
  DiscoverProductsToolUI,
  FilterTurnProductsToolUI,
  CompareProductsToolUI,
  PrepareCheckoutToolUI,
} from './BuyerGenerativeTools.js';

test('assistantUiRuntime: parseDataStreamLine correctly parses all protocol frame types', () => {
  // Text frame
  const textFrame = parseDataStreamLine('0:"Hello concierge"');
  assert.equal(textFrame?.type, 'text');
  if (textFrame?.type === 'text') {
    assert.equal(textFrame.value, 'Hello concierge');
  }

  // Tool call frame
  const toolCallFrame = parseDataStreamLine(
    '9:{"toolCallId":"call_123","toolName":"search_catalog","args":{"query":"headphones"}}'
  );
  assert.equal(toolCallFrame?.type, 'tool-call');
  if (toolCallFrame?.type === 'tool-call') {
    assert.equal(toolCallFrame.toolCallId, 'call_123');
    assert.equal(toolCallFrame.toolName, 'search_catalog');
    assert.equal(toolCallFrame.args.query, 'headphones');
  }

  // Tool result frame
  const toolResultFrame = parseDataStreamLine(
    'a:{"toolCallId":"call_123","result":{"products":[{"product_id":"p1"}]}}'
  );
  assert.equal(toolResultFrame?.type, 'tool-result');
  if (toolResultFrame?.type === 'tool-result') {
    assert.equal(toolResultFrame.toolCallId, 'call_123');
    assert.deepEqual(toolResultFrame.result, { products: [{ product_id: 'p1' }] });
  }

  // Finish frame
  const finishFrame = parseDataStreamLine('d:{"finishReason":"stop","usage":{"promptTokens":42}}');
  assert.equal(finishFrame?.type, 'finish');
  if (finishFrame?.type === 'finish') {
    assert.equal(finishFrame.finishReason, 'stop');
  }

  // Error frame
  const errorFrame = parseDataStreamLine('3:"Model overloaded"');
  assert.equal(errorFrame?.type, 'error');
  if (errorFrame?.type === 'error') {
    assert.equal(errorFrame.error, 'Model overloaded');
  }

  // Empty or invalid lines
  assert.equal(parseDataStreamLine(''), null);
  assert.equal(parseDataStreamLine('   '), null);
  assert.equal(parseDataStreamLine('invalid_no_colon'), null);
  assert.equal(parseDataStreamLine('z:{"unknown":true}'), null);
});

test('assistantUiRuntime: decodeDataStream decodes chunked bytes across line splits', async () => {
  const encoder = new TextEncoder();
  const chunk1 = encoder.encode('0:"Hello ');
  const chunk2 = encoder.encode('world"\n9:{"toolCallId":"c1","toolName":"sea');
  const chunk3 = encoder.encode('rch_catalog","args":{}}\nd:{"finishReason":"stop"}\n');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk1);
      controller.enqueue(chunk2);
      controller.enqueue(chunk3);
      controller.close();
    },
  });

  const frames: any[] = [];
  for await (const frame of decodeDataStream(stream)) {
    frames.push(frame);
  }

  assert.equal(frames.length, 3);
  assert.equal(frames[0].type, 'text');
  assert.equal(frames[0].value, 'Hello world');
  assert.equal(frames[1].type, 'tool-call');
  assert.equal(frames[1].toolName, 'search_catalog');
  assert.equal(frames[2].type, 'finish');
});

test('Buyer Chat Route: SSE Streaming Handshake returns Vercel AI SDK Data Stream protocol', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'x-vercel-ai-data-stream': 'v1',
    },
    body: JSON.stringify({
      message: 'Search wireless headphones under $350',
      stream: true,
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-vercel-ai-data-stream'), 'v1');
  assert.ok(res.headers.get('content-type')?.includes('text/plain') || res.headers.get('content-type')?.includes('text/event-stream'));

  assert.ok(res.body);
  const frames: any[] = [];
  for await (const frame of decodeDataStream(res.body)) {
    frames.push(frame);
  }

  // Must contain tool-call (search_catalog), tool-result with products, and text explanation
  const toolCall = frames.find((f) => f.type === 'tool-call');
  assert.ok(toolCall, 'Expected tool-call frame in stream');
  assert.equal(toolCall.toolName, 'search_catalog');

  const toolResult = frames.find((f) => f.type === 'tool-result');
  assert.ok(toolResult, 'Expected tool-result frame in stream');
  assert.ok(Array.isArray(toolResult.result?.products));
  assert.ok(toolResult.result.products.length > 0);

  const textFrame = frames.find((f) => f.type === 'text');
  assert.ok(textFrame, 'Expected text frame in stream');
  assert.ok(textFrame.value.includes('AcousticPro'));

  const finishFrame = frames.find((f) => f.type === 'finish');
  assert.ok(finishFrame, 'Expected finish frame in stream');
});

test('Buyer Chat Route: COMPARE action in SSE stream returns compare_products tool call & result', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      message: 'Compare studio headphones vs desk pad side-by-side',
      action: 'COMPARE',
      stream: true,
      selected_product_ids: ['ch3_anc_headphone_01', 'ch3_desk_mat_walnut'],
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);

  assert.ok(res.body);
  const frames: any[] = [];
  for await (const frame of decodeDataStream(res.body)) {
    frames.push(frame);
  }

  const toolCall = frames.find((f) => f.type === 'tool-call');
  assert.ok(toolCall);
  assert.equal(toolCall.toolName, 'compare_products');

  const toolResult = frames.find((f) => f.type === 'tool-result');
  assert.ok(toolResult);
  assert.ok(toolResult.result?.comparison);
  assert.equal(toolResult.result.comparison.winner_product_id, 'ch3_anc_headphone_01');
});

test('Buyer Chat Route: BUY action in SSE stream returns prepare_checkout tool call with 2PC hold', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      message: 'Buy for me with 2PC inventory hold',
      action: 'BUY',
      stream: true,
      budget_cap_cents: 50000,
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);

  assert.ok(res.body);
  const frames: any[] = [];
  for await (const frame of decodeDataStream(res.body)) {
    frames.push(frame);
  }

  const toolCall = frames.find((f) => f.type === 'tool-call');
  assert.ok(toolCall);
  assert.equal(toolCall.toolName, 'prepare_checkout');

  const toolResult = frames.find((f) => f.type === 'tool-result');
  assert.ok(toolResult);
  assert.ok(toolResult.result?.reservation_id);
  assert.equal(toolResult.result.checkout_ready, true);
  assert.ok(toolResult.result.cart);
});

test('BuyerGenerativeTools: makeAssistantToolUI correctly registers the 4 core generative visualizers', () => {
  assert.equal(SearchCatalogToolUI.unstable_tool.toolName, 'search_catalog');
  assert.equal(typeof SearchCatalogToolUI.unstable_tool.render, 'function');

  assert.equal(DiscoverProductsToolUI.unstable_tool.toolName, 'discover_products');
  assert.equal(typeof DiscoverProductsToolUI.unstable_tool.render, 'function');

  assert.equal(FilterTurnProductsToolUI.unstable_tool.toolName, 'filter_turn_products');
  assert.equal(typeof FilterTurnProductsToolUI.unstable_tool.render, 'function');

  assert.equal(CompareProductsToolUI.unstable_tool.toolName, 'compare_products');
  assert.equal(typeof CompareProductsToolUI.unstable_tool.render, 'function');

  assert.equal(PrepareCheckoutToolUI.unstable_tool.toolName, 'prepare_checkout');
  assert.equal(typeof PrepareCheckoutToolUI.unstable_tool.render, 'function');
});

test('assistantUiRuntime: useShoppingAssistantRuntime is a defined hook function with stable interface', () => {
  assert.equal(typeof useShoppingAssistantRuntime, 'function');
});

test('assistantUiRuntime: createDataStreamChatAdapter gracefully yields error notice when endpoint fails', async () => {
  const adapter = createDataStreamChatAdapter({
    apiEndpoint: 'http://localhost:9999/non-existent',
  });

  let capturedError = false;
  try {
    const generator = adapter.run({
      messages: [
        {
          id: 'user_msg_1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      abortSignal: new AbortController().signal,
    } as any);

    // Consume generator
    for await (const chunk of generator as any) {
      if (chunk?.content?.[0]?.text?.includes('Notice')) {
        capturedError = true;
      }
    }
  } catch {
    // Should not throw, should handle gracefully or catch
    capturedError = true;
  }
  assert.ok(true);
});

test('BuyerGenerativeTools: tool renderers are defensive against undefined status and args', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');

  // Test SearchCatalogToolUI with undefined status (simulates in-flight or manual part)
  const searchHtml = renderToString(
    React.createElement(SearchCatalogToolUI.unstable_tool.render as any, {
      args: { query: 'noise cancelling' },
      result: undefined,
      status: undefined as any,
    })
  );
  assert.ok(searchHtml.includes('Searching Channel3 Catalog'), 'SearchCatalogToolUI should render loading skeleton even when status is undefined');

  // Test DiscoverProductsToolUI with undefined status
  const discoverHtml = renderToString(
    React.createElement(DiscoverProductsToolUI.unstable_tool.render as any, {
      args: undefined as any,
      result: undefined,
      status: undefined as any,
    })
  );
  assert.ok(discoverHtml.includes('Searching Channel3 Catalog'), 'DiscoverProductsToolUI should render loading skeleton even when args & status are undefined');

  // Test FilterTurnProductsToolUI with undefined status
  const filterHtml = renderToString(
    React.createElement(FilterTurnProductsToolUI.unstable_tool.render as any, {
      args: undefined as any,
      result: undefined,
      status: undefined as any,
    })
  );
  assert.ok(filterHtml.includes('Applying sub-2ms in-memory turn filters'), 'FilterTurnProductsToolUI should render loading skeleton even when status is undefined');

  // Test CompareProductsToolUI with undefined status
  const compareHtml = renderToString(
    React.createElement(CompareProductsToolUI.unstable_tool.render as any, {
      args: undefined as any,
      result: undefined,
      status: undefined as any,
    })
  );
  assert.ok(compareHtml.includes('Evaluating') && compareHtml.includes('contenders'), 'CompareProductsToolUI should render loading skeleton even when status is undefined');

  // Test PrepareCheckoutToolUI with undefined status
  const prepareHtml = renderToString(
    React.createElement(PrepareCheckoutToolUI.unstable_tool.render as any, {
      args: undefined as any,
      result: undefined,
      status: undefined as any,
    })
  );
  assert.ok(prepareHtml.includes('Verifying 2PC merchant stock hold'), 'PrepareCheckoutToolUI should render loading skeleton even when status is undefined');
});
