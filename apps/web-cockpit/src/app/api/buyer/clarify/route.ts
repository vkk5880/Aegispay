import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = (body?.query || '').trim();
    const orchestratorUrl = getApiBaseUrl();

    if (orchestratorUrl) {
      try {
        const res = await fetch(`${orchestratorUrl}/api/buyer/clarify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          cache: 'no-store',
        });
        if (res.ok) {
          return NextResponse.json(await res.json());
        }
      } catch (err: any) {
        apiLogger.warn('[BFF:clarify] Orchestrator unreachable, using fallback:', err?.message);
      }
    }

    // Resilient local fallback
    const lower = query.toLowerCase();
    const isVague =
      query.length > 0 &&
      (query.split(/\s+/).length <= 2 ||
        /^(headphone|headphones|laptop|phone|tv|watch|shoes|gift|audio|camera)$/i.test(lower));

    let questions: string[] = [];
    if (isVague) {
      if (lower.includes('headphone') || lower.includes('audio')) {
        questions = [
          'Are you looking for wireless noise-canceling or wired audiophile headphones?',
          'What is your target budget (e.g. under $150 or under $350)?',
        ];
      } else if (lower.includes('laptop') || lower.includes('computer')) {
        questions = [
          'Will this be used for productivity, software development, or gaming?',
          'What screen size or operating system do you prefer?',
        ];
      } else {
        questions = [
          'What key feature or brand is most important to you?',
          'What is your target budget for this purchase?',
        ];
      }
    }

    return NextResponse.json({
      status: 'SUCCESS',
      needs_clarification: isVague,
      questions,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'ERROR', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
