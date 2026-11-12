import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function GET() {
  const orchestratorUrl = getApiBaseUrl();

  if (orchestratorUrl) {
    try {
      const res = await fetch(`${orchestratorUrl}/api/buyer/models`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('[BFF:models] Orchestrator unreachable, using fallback models:', err?.message);
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    active_model: 'google/gemini-2.5-flash',
    default_model: 'google/gemini-2.5-flash',
    available_models: [
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        badge: 'Recommended',
        description: 'Fast, high-throughput autonomous commerce and multimodal reasoning.',
        requires_user_key: false,
      },
      {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        badge: 'Deep Reasoning',
        description: 'Comprehensive cross-merchant catalog synthesis and complex constraint satisfaction.',
        requires_user_key: false,
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        badge: 'BYOK Required',
        description: 'Omni-channel conversational intelligence with high flexibility.',
        requires_user_key: true,
      },
      {
        id: 'anthropic/claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        badge: 'BYOK Required',
        description: 'Advanced reasoning, schema verification, and tool-calling precision.',
        requires_user_key: true,
      },
    ],
  });
}
