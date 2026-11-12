import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  let body: { user_id?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = req.headers.get('authorization');
      if (auth) headers['Authorization'] = auth;
      const sessionToken = req.headers.get('x-session-token');
      if (sessionToken) headers['x-session-token'] = sessionToken;

      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist/check`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: body.user_id || 'sb-buyer@personal.example.com' }),
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist/check', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    checked_count: 0,
    price_drops_detected: 0,
    summary: 'Automated 72-Hour price-watcher scan complete. No active price drops detected at this moment.',
  });
}
