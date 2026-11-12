import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function GET(req: Request) {
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = req.headers.get('authorization');
      if (auth) headers['Authorization'] = auth;
      const sessionToken = req.headers.get('x-session-token');
      if (sessionToken) headers['x-session-token'] = sessionToken;

      const res = await fetch(`${orchestratorUrl}/api/buyer/prefs`, {
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch {}
  }

  return NextResponse.json({
    status: 'SUCCESS',
    preferences: {
      budget_cap_cents: 50000,
      fulfillment_mode: 'PRICE_WATCHER_72H',
      purchasing_rule: 'ALWAYS_CONFIRM',
      auto_buy_threshold_cents: 2500,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = req.headers.get('authorization');
      if (auth) headers['Authorization'] = auth;
      const sessionToken = req.headers.get('x-session-token');
      if (sessionToken) headers['x-session-token'] = sessionToken;

      const res = await fetch(`${orchestratorUrl}/api/buyer/prefs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch {}
  }

  return NextResponse.json({
    status: 'SUCCESS',
    preferences: body,
  });
}
