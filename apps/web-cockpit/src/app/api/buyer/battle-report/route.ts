import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { contender_a, contender_b } = body || {};

    if (!contender_a || !contender_b) {
      return NextResponse.json(
        { error: 'MISSING_CONTENDERS', message: 'Both contender_a and contender_b are required.' },
        { status: 400 }
      );
    }

    const orchestratorUrl = getApiBaseUrl();
    if (orchestratorUrl) {
      try {
        const res = await fetch(`${orchestratorUrl}/api/buyer/battle-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contender_a, contender_b }),
          cache: 'no-store',
        });
        if (res.ok) {
          return NextResponse.json(await res.json());
        }
      } catch (err: any) {
        apiLogger.warn('[BFF:battle-report] Orchestrator unreachable, using fallback:', err?.message);
      }
    }

    // Resilient local fallback comparison report
    const titleA = contender_a.title || 'Contender A';
    const titleB = contender_b.title || 'Contender B';
    const priceA = contender_a.price_cents ? (contender_a.price_cents / 100).toFixed(2) : '0.00';
    const priceB = contender_b.price_cents ? (contender_b.price_cents / 100).toFixed(2) : '0.00';

    return NextResponse.json({
      status: 'SUCCESS',
      battle_report: `### Head-to-Head Analysis: ${titleA} vs. ${titleB}\n\n- **Pricing:** ${titleA} ($${priceA}) vs. ${titleB} ($${priceB})\n- **Value Verdict:** Both products offer verified buyer protection with competitive features. Check user reviews and warranty terms for your specific use case.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'ERROR', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
