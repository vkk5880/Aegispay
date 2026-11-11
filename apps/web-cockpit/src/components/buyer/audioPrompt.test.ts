import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

import { AudioPromptButton } from './AudioPromptButton.js';
import { ChatInputBar } from './ChatInputBar.js';
import { VoiceSearchButton } from './VoiceSearchButton.js';
import { ChatFlow } from './ChatFlow.js';
import { GenerativeIntentBar } from './GenerativeIntentBar.js';
import { POST as audioTranscribeHandler } from '../../app/api/buyer/audio-transcribe/route.js';

test('1. AudioPromptButton: Renders safely in SSR environment without window errors', () => {
  const html = renderToStaticMarkup(
    React.createElement(AudioPromptButton, {
      onTranscript: () => {},
      disabled: false,
    })
  );

  assert.ok(html.includes('<button'), 'Should render button element');
  assert.ok(html.includes('aria-label='), 'Should have accessible aria-label');
  assert.ok(html.includes('title='), 'Should have descriptive title tooltip');
});

test('2. AudioPromptButton: Supports pill and compact variants with proper styling', () => {
  const compactHtml = renderToStaticMarkup(
    React.createElement(AudioPromptButton, {
      onTranscript: () => {},
      variant: 'compact',
    })
  );
  assert.ok(compactHtml.includes('rounded-xl'), 'Compact variant should have rounded-xl');

  const pillHtml = renderToStaticMarkup(
    React.createElement(AudioPromptButton, {
      onTranscript: () => {},
      variant: 'pill',
    })
  );
  assert.ok(pillHtml.includes('rounded-full'), 'Pill variant should have rounded-full');
  assert.ok(pillHtml.includes('Voice'), 'Pill variant should display text label');
});

test('3. ChatInputBar: Includes AudioPromptButton inside chat prompt entering interface', () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatInputBar, {
      inputMessage: 'Find studio monitors',
      onInputChange: () => {},
      onSubmit: () => {},
      isLoading: false,
      selectedProducts: [],
      onRemoveSelectedProduct: () => {},
      onClearAllSelected: () => {},
    })
  );

  assert.ok(html.includes('input'), 'Should render prompt input field');
  assert.ok(html.includes('Send'), 'Should render Send button');
  assert.ok(html.includes('title='), 'Should render AudioPromptButton with title');
  assert.ok(html.includes('Dictate') || html.includes('Voice') || html.includes('Google Audio'), 'Should render voice audio trigger in chat bar');
});

test('4. VoiceSearchButton: Wraps AudioPromptButton with backwards-compatible interface', () => {
  const html = renderToStaticMarkup(
    React.createElement(VoiceSearchButton, {
      onTranscript: () => {},
      disabled: false,
    })
  );

  assert.ok(html.includes('<button'), 'Should render button element');
  assert.ok(html.includes('aria-label='), 'Should have accessible aria-label');
});

test('5. ChatFlow: Renders search input with AudioPromptButton voice trigger', () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatFlow, {
      disabled: false,
      initialQuery: 'ergonomic chair',
    })
  );

  assert.ok(html.includes('type="search"'), 'Should render search input');
  assert.ok(html.includes('Execute'), 'Should render execute button');
  assert.ok(html.includes('aria-label='), 'Should include accessible audio trigger');
});

test('6. GenerativeIntentBar: Renders input with AudioPromptButton voice trigger', () => {
  const html = renderToStaticMarkup(
    React.createElement(GenerativeIntentBar, {
      isLoading: false,
    })
  );

  assert.ok(html.includes('Solve'), 'Should render Solve button');
  assert.ok(html.includes('aria-label='), 'Should include accessible audio trigger');
});

test('7. /api/buyer/audio-transcribe: Rejects empty audio payload with 400 status', async () => {
  const req = new NextRequest('http://localhost:3000/api/buyer/audio-transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const res = await audioTranscribeHandler(req);
  assert.equal(res.status, 400);

  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.error.includes('Empty audio payload'));
});

test('8. /api/buyer/audio-transcribe: Successfully processes audioBase64 payload and returns transcript', async () => {
  // 1-second silent webm header mock base64
  const mockWebmBase64 = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bmVoAAAAAAABk';

  const req = new NextRequest('http://localhost:3000/api/buyer/audio-transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: mockWebmBase64,
      mimeType: 'audio/webm',
    }),
  });

  const res = await audioTranscribeHandler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(typeof data.transcript === 'string');
  assert.ok(data.transcript.length > 0, 'Should return a transcribed query');
  assert.ok(['google-gemini', 'fallback'].includes(data.engine), 'Should report valid engine');
});

test('9. /api/buyer/audio-transcribe: Accepts multipart/form-data audio file uploads', async () => {
  const formData = new FormData();
  const mockBlob = new Blob(['mock audio data content bytes'], { type: 'audio/webm' });
  formData.append('audio', mockBlob, 'speech.webm');

  const req = new NextRequest('http://localhost:3000/api/buyer/audio-transcribe', {
    method: 'POST',
    body: formData,
  });

  const res = await audioTranscribeHandler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(typeof data.transcript === 'string');
});
