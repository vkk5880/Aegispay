import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { provider, apiKey, model } = body;

  if (!provider || !apiKey || !apiKey.trim()) {
    return NextResponse.json(
      { valid: false, error: 'Provider and API key are required.' },
      { status: 400 }
    );
  }

  const orchestratorUrl = getApiBaseUrl() || 'http://127.0.0.1:4000';

  // Try verifying via orchestrator first
  try {
    const upstreamRes = await fetch(`${orchestratorUrl}/api/buyer/verify-llm-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, model }),
      cache: 'no-store',
    });

    const data = await upstreamRes.json();
    if (upstreamRes.ok && data.valid) {
      apiLogger.info(`[VerifyLLMKey] Successfully verified key for ${provider} via orchestrator`);
      return NextResponse.json(data);
    } else {
      apiLogger.warn(`[VerifyLLMKey] Verification failed for ${provider} via orchestrator:`, data.error);
      return NextResponse.json(
        { valid: false, error: data.error || `Invalid ${provider} API key.` },
        { status: 400 }
      );
    }
  } catch (err: any) {
    apiLogger.warn('[VerifyLLMKey] Orchestrator unreachable, verifying directly against provider:', err?.message);
  }

  // Direct fallback verification
  try {
    if (provider === 'google') {
      const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
      const res = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey.trim(),
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `Google API returned HTTP ${res.status}`;
        return NextResponse.json(
          { valid: false, error: `Google Gemini API key invalid: ${errMsg}` },
          { status: 400 }
        );
      }
      return NextResponse.json({ valid: true, provider: 'google', message: 'Google API key verified successfully' });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `OpenAI returned HTTP ${res.status}`;
        return NextResponse.json(
          { valid: false, error: `OpenAI API key invalid: ${errMsg}` },
          { status: 400 }
        );
      }
      return NextResponse.json({ valid: true, provider: 'openai', message: 'OpenAI API key verified successfully' });
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      if (res.status === 401 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `Anthropic returned HTTP ${res.status}`;
        return NextResponse.json(
          { valid: false, error: `Anthropic API key invalid: ${errMsg}` },
          { status: 400 }
        );
      }
      return NextResponse.json({ valid: true, provider: 'anthropic', message: 'Anthropic API key verified successfully' });
    }

    return NextResponse.json({ valid: true, provider: 'custom', message: 'Custom key accepted' });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: `Failed to verify with ${provider}: ${err?.message}` },
      { status: 500 }
    );
  }
}
