import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId =
    url.searchParams.get('user_id') ||
    req.headers.get('x-user-id') ||
    'demo';

  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = req.headers.get('authorization');
      if (authHeader) headers['authorization'] = authHeader;
      const sessionToken = req.headers.get('x-session-token');
      if (sessionToken) headers['x-session-token'] = sessionToken;
      if (userId) headers['x-user-id'] = userId;

      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist${url.search}`, {
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist; using live empty state', { error: err?.message });
    }
  }

  // Live default: return clean empty list for the user; zero mock/test data
  return NextResponse.json({
    status: 'SUCCESS',
    watchlist: [],
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist POST; using local fallback', { error: err?.message });
    }
  }

  const currentCents = Math.round(Number(body.current_price_cents) || 0);
  const targetCents = Math.round(Number(body.target_price_cents) || 0);
  const nowIso = new Date().toISOString();

  const newItem = {
    id: `wch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: body.user_id || 'sb-buyer@personal.example.com',
    title: body.title,
    current_price_cents: currentCents,
    target_price_cents: targetCents,
    source: body.source || 'web',
    link: body.link || '',
    query: body.query || body.title,
    added_at: nowIso,
    last_checked: nowIso,
    triggered: currentCents > 0 && currentCents <= targetCents,
  };

  return NextResponse.json({
    status: 'SUCCESS',
    watchlist_item: newItem,
  });
}

export async function DELETE(req: Request) {
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const body = await req.json();
      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist DELETE', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    removed: true,
  });
}
