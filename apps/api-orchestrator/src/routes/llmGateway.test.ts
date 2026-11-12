import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { llmGatewayRoutes } from './llm.gateway.js';
import { disputeRoutes } from './dispute.routes.js';

async function buildTestApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(sensible);
  await fastify.register(llmGatewayRoutes);
  await fastify.register(disputeRoutes);
  return fastify;
}

test('LLM Gateway: GET /v1/models returns standard OpenAI models list', async () => {
  const app = await buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/v1/models',
  });

  assert.equal(res.statusCode, 200);
  const json = res.json();
  assert.equal(json.object, 'list');
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length >= 4);
  const modelIds = json.data.map((m: any) => m.id);
  assert.ok(modelIds.includes('aegispay-commerce-agent'));
  assert.ok(modelIds.includes('google/gemini-2.5-flash'));
});

test('LLM Gateway: POST /v1/chat/completions handles OpenAI chat format', async () => {
  const app = await buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    headers: {
      'x-guest-session': 'true',
      'Content-Type': 'application/json',
    },
    payload: {
      model: 'aegispay-commerce-agent',
      messages: [
        { role: 'user', content: 'What products are available for under $300?' },
      ],
      stream: false,
    },
  });

  assert.equal(res.statusCode, 200);
  const json = res.json();
  assert.equal(json.object, 'chat.completion');
  assert.ok(json.id.startsWith('chatcmpl-'));
  assert.ok(Array.isArray(json.choices));
  assert.equal(json.choices[0].message.role, 'assistant');
  assert.ok(typeof json.choices[0].message.content === 'string');
  assert.ok(json.choices[0].message.content.length > 0);
  assert.ok(json.usage);
});

test('Dispute Routes: GET /api/disputes/:id/dossier generates real forensic PDF dossier', async () => {
  const app = await buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/disputes/DISPUTE-TEST-999/dossier',
    headers: {
      'x-guest-session': 'true',
    },
  });

  assert.equal(res.statusCode, 200);
  const json = res.json();
  assert.equal(json.status, 'SUCCESS');
  assert.equal(json.dispute_id, 'DISPUTE-TEST-999');
  assert.ok(typeof json.compiled_evidence_pdf_base64 === 'string');
  assert.ok(json.compiled_evidence_pdf_base64.length > 500);
  assert.ok(json.size_bytes > 500);
});
