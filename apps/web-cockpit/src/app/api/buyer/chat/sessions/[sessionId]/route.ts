import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const orchestratorUrl = getApiBaseUrl() || 'http://localhost:4000';
  apiLogger.debug(`GET /api/buyer/chat/sessions/${sessionId} received`);

  try {
    const res = await fetch(`${orchestratorUrl}/api/buyer/chat/sessions/${encodeURIComponent(sessionId)}`, {
      headers: {
        'authorization': req.headers.get('authorization') || '',
        'x-session-token': req.headers.get('x-session-token') || '',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err: any) {
    apiLogger.warn(`Upstream orchestrator unreachable for session ${sessionId}; attempting database query`, {
      error: err?.message,
    });
  }

  // Direct PostgreSQL query for session messages when orchestrator is unreachable
  if (process.env.DATABASE_URL) {
    try {
      const { createDb, chatSessions, chatMessages, eq } = await import('@aegispay/database');
      const db = createDb(process.env.DATABASE_URL);
      const sessionRows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1);

      if (sessionRows && sessionRows.length > 0) {
        const s = sessionRows[0];
        const msgRows = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.session_id, sessionId))
          .orderBy(chatMessages.created_at);

        return NextResponse.json({
          status: 'SUCCESS',
          session: {
            id: s.id,
            buyer_id: s.buyer_id,
            title: s.title,
            created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString(),
            updated_at: s.updated_at ? new Date(s.updated_at).toISOString() : new Date().toISOString(),
            message_count: msgRows.length,
          },
          messages: msgRows.map((m) => ({
            id: m.id,
            session_id: m.session_id,
            role: m.role,
            content: m.content,
            action: m.action,
            selected_product_ids: m.selected_product_ids,
            attached_products: m.attached_products,
            tool_calls: m.tool_calls,
            created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
          })),
        });
      }
    } catch (dbErr: any) {
      apiLogger.warn('Direct database query for chat session detail failed', { error: dbErr?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    session: null,
    messages: [],
  });
}
