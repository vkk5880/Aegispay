import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

const MOCK_WATCHLIST_ITEMS = [
  {
    id: 'wch_1730810400_a1',
    user_id: 'demo',
    title: 'Sony WH-1000XM5 Wireless Headphones (Midnight Silver)',
    current_price_cents: 34800,
    target_price_cents: 32000,
    source: 'bestbuy.com',
    link: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    added_at: '2026-11-06T10:00:00.000Z',
    last_checked: '2026-11-07T08:00:00.000Z',
    triggered: false,
  },
  {
    id: 'wch_1730810400_a2',
    user_id: 'demo',
    title: 'Precision Felt & Walnut Desk Organizer Pad',
    current_price_cents: 8500,
    target_price_cents: 7500,
    source: 'nordstrom.com',
    link: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400',
    added_at: '2026-11-05T10:00:00.000Z',
    last_checked: '2026-11-07T08:00:00.000Z',
    triggered: true,
  },
  {
    id: 'wch_1730810400_a3',
    user_id: 'demo',
    title: 'Anker Magnetic Wireless Charging Stand 3-in-1',
    current_price_cents: 12900,
    target_price_cents: 11000,
    source: 'target.com',
    link: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400',
    added_at: '2026-11-04T10:00:00.000Z',
    last_checked: '2026-11-07T08:00:00.000Z',
    triggered: false,
  },
];

export async function GET(req: Request) {
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const url = new URL(req.url);
      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist${url.search}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist; using fallback', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    watchlist: MOCK_WATCHLIST_ITEMS,
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

  const newItem = {
    id: `wch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: body.user_id || 'demo',
    title: body.title,
    current_price_cents: body.current_price_cents,
    target_price_cents: body.target_price_cents,
    source: body.source || 'web',
    link: body.link || '',
    query: body.query || '',
    added_at: new Date().toISOString(),
    triggered: false,
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
    } catch {}
  }

  return NextResponse.json({
    status: 'SUCCESS',
    removed: true,
  });
}
