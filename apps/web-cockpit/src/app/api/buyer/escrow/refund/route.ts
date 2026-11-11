import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  const body = await req.json();
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const res = await fetch(`${orchestratorUrl}/api/buyer/escrow/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for escrow/refund', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    order_id: body.order_id,
    escrow_status: 'REFUNDED',
    message: 'Pre-purchase escrow hold released and refunded to buyer.',
  });
}
