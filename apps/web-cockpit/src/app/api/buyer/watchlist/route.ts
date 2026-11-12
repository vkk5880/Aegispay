import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId =
    url.searchParams.get('user_id') ||
    req.headers.get('x-user-id') ||
    'sb-buyer@personal.example.com';

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
        const data = await res.json();
        if (Array.isArray(data.watchlist) && data.watchlist.length > 0) {
          return NextResponse.json(data);
        }
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist; using database lookup', { error: err?.message });
    }
  }

  // Direct PostgreSQL database query fallback
  if (process.env.DATABASE_URL) {
    try {
      const { createDb, buyerWatchlistTable, inArray, desc } = await import('@aegispay/database');
      const db = createDb(process.env.DATABASE_URL);

      const targetUserIds = [userId];
      if (userId === 'sb-buyer@personal.example.com' || userId === 'demo' || userId === 'guest') {
        targetUserIds.push('demo', 'sb-buyer@personal.example.com', 'usr_pp_buyer');
      }

      const rows = await db
        .select()
        .from(buyerWatchlistTable)
        .where(inArray(buyerWatchlistTable.user_id, Array.from(new Set(targetUserIds))))
        .orderBy(desc(buyerWatchlistTable.created_at))
        .limit(100);

      if (rows && rows.length > 0) {
        const watchlist = rows.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          title: r.title,
          current_price_cents: r.current_price_cents,
          target_price_cents: r.target_price_cents,
          source: r.source || 'web',
          link: r.link || '',
          query: r.query || r.title,
          added_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          last_checked: r.last_checked ? new Date(r.last_checked).toISOString() : undefined,
          triggered: Boolean(r.triggered),
        }));
        return NextResponse.json({
          status: 'SUCCESS',
          watchlist,
        });
      }
    } catch (dbErr: any) {
      apiLogger.warn('Direct database query for watchlist encountered error', { error: dbErr?.message });
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
  let orchestratorItem: any = null;

  if (orchestratorUrl) {
    try {
      const res = await fetch(`${orchestratorUrl}/api/buyer/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.watchlist_item) {
          orchestratorItem = data.watchlist_item;
        }
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist POST; using local fallback', { error: err?.message });
    }
  }

  const currentCents = Math.round(Number(body.current_price_cents) || 0);
  const targetCents = Math.round(Number(body.target_price_cents) || Math.round(currentCents * 0.9) || 1000);
  const now = new Date();
  const userId = body.user_id || 'sb-buyer@personal.example.com';
  const itemId = body.id || orchestratorItem?.id || `wch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newItem = {
    id: itemId,
    user_id: userId,
    title: body.title || 'Saved Product',
    current_price_cents: currentCents,
    target_price_cents: targetCents,
    source: body.source || 'web',
    link: body.link || '',
    query: body.query || body.title || '',
    added_at: now.toISOString(),
    last_checked: now.toISOString(),
    triggered: currentCents > 0 && currentCents <= targetCents,
  };

  // Direct PostgreSQL persist
  if (process.env.DATABASE_URL) {
    try {
      const { createDb, buyerWatchlistTable } = await import('@aegispay/database');
      const db = createDb(process.env.DATABASE_URL);

      await db
        .insert(buyerWatchlistTable)
        .values({
          id: newItem.id,
          user_id: newItem.user_id,
          title: newItem.title.slice(0, 255),
          current_price_cents: newItem.current_price_cents,
          target_price_cents: newItem.target_price_cents,
          source: (newItem.source || 'web').slice(0, 128),
          link: newItem.link,
          query: newItem.query,
          triggered: newItem.triggered,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: buyerWatchlistTable.id,
          set: {
            title: newItem.title.slice(0, 255),
            current_price_cents: newItem.current_price_cents,
            target_price_cents: newItem.target_price_cents,
            source: (newItem.source || 'web').slice(0, 128),
            link: newItem.link,
            query: newItem.query,
            triggered: newItem.triggered,
            updated_at: now,
          },
        });
      apiLogger.info('Direct database save to buyer_watchlist succeeded', { id: newItem.id, userId: newItem.user_id, title: newItem.title });
    } catch (dbErr: any) {
      apiLogger.warn('Direct database insert into buyer_watchlist failed', { error: dbErr?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    watchlist_item: orchestratorItem || newItem,
  });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const orchestratorUrl = getApiBaseUrl();
  const id = body?.item_id || body?.id || body?.title || '';
  const userId = body?.user_id || 'sb-buyer@personal.example.com';
  const targetUserIds = [userId];
  if (userId === 'sb-buyer@personal.example.com' || userId === 'demo' || userId === 'guest') {
    targetUserIds.push('demo', 'sb-buyer@personal.example.com', 'usr_pp_buyer');
  }

  if (orchestratorUrl) {
    try {
      await fetch(`${orchestratorUrl}/api/buyer/watchlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for watchlist DELETE', { error: err?.message });
    }
  }

  // Direct PostgreSQL delete
  if (process.env.DATABASE_URL && id) {
    try {
      const { createDb, buyerWatchlistTable, eq, or, inArray, and } = await import('@aegispay/database');
      const db = createDb(process.env.DATABASE_URL);

      await db
        .delete(buyerWatchlistTable)
        .where(
          and(
            inArray(buyerWatchlistTable.user_id, Array.from(new Set(targetUserIds))),
            or(
              eq(buyerWatchlistTable.id, id),
              eq(buyerWatchlistTable.title, id),
              eq(buyerWatchlistTable.query, id)
            )
          )
        );
      apiLogger.info('Direct database removal from buyer_watchlist succeeded', { id, userId });
    } catch (dbErr: any) {
      apiLogger.warn('Direct database removal from buyer_watchlist failed', { error: dbErr?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    removed: true,
  });
}
