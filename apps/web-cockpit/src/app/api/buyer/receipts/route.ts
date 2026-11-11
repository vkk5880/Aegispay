import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

const MOCK_RECEIPTS = [
  {
    receipt_number: 1042,
    product_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    amount_cents: 34800,
    merchant_domain: 'bestbuy.com',
    tx_id: 'PAYID-M884920491XAU',
    chain_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: '2026-11-07T10:00:00.000Z',
  },
  {
    receipt_number: 1043,
    product_title: 'Anker Magnetic Wireless Charging Stand 3-in-1',
    amount_cents: 12900,
    merchant_domain: 'target.com',
    tx_id: 'PAYID-M773910284YTK',
    chain_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    timestamp: '2026-11-06T20:00:00.000Z',
  },
  {
    receipt_number: 1044,
    product_title: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard',
    amount_cents: 19900,
    merchant_domain: 'nordstrom.com',
    tx_id: 'PAYID-M662809173PLQ',
    chain_hash: 'f0e1d2c3b4a59687786950413223140596877869504132231405968778695041',
    timestamp: '2026-11-05T14:00:00.000Z',
  },
];

export async function GET(req: Request) {
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const url = new URL(req.url);
      const res = await fetch(`${orchestratorUrl}/api/buyer/receipts${url.search}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for receipts; using fallback', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    receipts: MOCK_RECEIPTS,
  });
}
