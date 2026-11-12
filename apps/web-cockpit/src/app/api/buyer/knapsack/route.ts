import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const orchestratorUrl = getApiBaseUrl();

    if (orchestratorUrl) {
      try {
        const res = await fetch(`${orchestratorUrl}/api/buyer/knapsack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        if (res.ok) {
          return NextResponse.json(await res.json());
        }
      } catch (err: any) {
        apiLogger.warn('[BFF:knapsack] Orchestrator unreachable, falling back:', err?.message);
      }
    }

    const items: any[] = Array.isArray(body.items) ? body.items : [];
    const grossSubtotalCents = items.reduce(
      (sum, it) => sum + (Number(it.unit_price_cents || it.price_cents || 0) * Number(it.quantity || 1)),
      0
    );
    const rebateCents = Math.round(grossSubtotalCents * 0.12);
    const shippingCents = grossSubtotalCents >= 25000 ? 0 : 999;
    const netBuyerExpenditureCents = Math.max(0, grossSubtotalCents - rebateCents + shippingCents);

    return NextResponse.json({
      status: 'SUCCESS',
      cart: {
        gross_subtotal_cents: grossSubtotalCents,
        total_commission_rebate_cents: rebateCents,
        total_shipping_cents: shippingCents,
        total_shipping_saved_cents: shippingCents === 0 ? 999 : 0,
        net_buyer_expenditure_cents: netBuyerExpenditureCents,
        budget_cap_cents: Number(body.budget_cap_cents || 50000),
        is_within_budget: netBuyerExpenditureCents <= Number(body.budget_cap_cents || 50000),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'ERROR', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
