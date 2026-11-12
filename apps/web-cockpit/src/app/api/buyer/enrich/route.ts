import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = (body?.query || '').trim();
    const answers = (body?.answers && typeof body.answers === 'object') ? body.answers : {};
    const orchestratorUrl = getApiBaseUrl();

    if (orchestratorUrl) {
      try {
        const res = await fetch(`${orchestratorUrl}/api/buyer/enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, answers }),
          cache: 'no-store',
        });
        if (res.ok) {
          return NextResponse.json(await res.json());
        }
      } catch (err: any) {
        apiLogger.warn('[BFF:enrich] Orchestrator unreachable, using fallback:', err?.message);
      }
    }

    // Resilient local fallback
    const answerFragments = Object.values(answers)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());

    const enriched = answerFragments.length > 0
      ? `${query} ${answerFragments.join(' ')}`.trim()
      : query;

    return NextResponse.json({
      status: 'SUCCESS',
      original_query: query,
      enriched_query: enriched,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'ERROR', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
