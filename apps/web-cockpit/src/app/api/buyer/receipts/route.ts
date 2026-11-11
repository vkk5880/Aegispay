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

      const res = await fetch(`${orchestratorUrl}/api/buyer/receipts${url.search}`, {
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for receipts; checking database', {
        error: err?.message,
      });
    }
  }

  // Direct PostgreSQL query for receipts when orchestrator is unavailable
  if (process.env.DATABASE_URL) {
    try {
      const { createDb, purchaseHistoryTable, eq, desc } = await import('@aegispay/database');
      const db = createDb(process.env.DATABASE_URL);
      const rows = await db
        .select()
        .from(purchaseHistoryTable)
        .where(eq(purchaseHistoryTable.user_id, userId))
        .orderBy(desc(purchaseHistoryTable.created_at))
        .limit(50);

      if (rows && rows.length > 0) {
        const receipts = rows.map((r, idx) => ({
          receipt_number: r.receipt_number || 1000 + idx,
          product_title: r.title,
          amount_cents: r.price_cents,
          merchant_domain: r.merchant_domain,
          tx_id: r.tx_id || r.order_id,
          chain_hash: r.hash || `0x${Buffer.from(r.order_id).toString('hex').padStart(64, '0')}`,
          timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }));
        return NextResponse.json({
          status: 'SUCCESS',
          receipts,
        });
      }
    } catch (dbErr: any) {
      apiLogger.warn('Direct database query for receipts encountered error', { error: dbErr?.message });
    }
  }

  // Strictly return empty if no user receipts exist (zero mock/test data)
  return NextResponse.json({
    status: 'SUCCESS',
    receipts: [],
  });
}
