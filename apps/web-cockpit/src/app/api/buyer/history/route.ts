import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

const MOCK_HISTORY_ORDERS = [
  {
    order_id: 'ord_pp_884920491',
    user_id: 'demo',
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
    price_cents: 34800,
    merchant_domain: 'bestbuy.com',
    cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    score: 9.4,
    tx_id: 'PAYID-M884920491XAU',
    reservation_id: 'vch_9f8a7d6c5b4e3a21',
    escrow_status: 'CAPTURED',
    timestamp: '2026-11-07T10:00:00.000Z',
    receipt_number: 1042,
    hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    carrier: 'FedEx Priority',
    tracking_number: '789012345678',
    fulfillment_status: 'delivered',
  },
  {
    order_id: 'ord_pp_773910284',
    user_id: 'demo',
    title: 'Anker Magnetic Wireless Charging Stand 3-in-1',
    price_cents: 12900,
    merchant_domain: 'target.com',
    cleaned_url: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400',
    score: 9.1,
    tx_id: 'PAYID-M773910284YTK',
    reservation_id: 'vch_4e3a219f8a7d6c5b',
    escrow_status: 'HELD',
    timestamp: '2026-11-06T20:00:00.000Z',
    receipt_number: 1043,
    hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    carrier: 'UPS Ground',
    tracking_number: '1Z9999999999999999',
    fulfillment_status: 'shipped',
  },
  {
    order_id: 'ord_pp_662809173',
    user_id: 'demo',
    title: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard',
    price_cents: 19900,
    merchant_domain: 'nordstrom.com',
    cleaned_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400',
    score: 8.8,
    tx_id: 'PAYID-M662809173PLQ',
    reservation_id: 'vch_1b2c3d4e5f67890a',
    escrow_status: 'REFUNDED',
    timestamp: '2026-11-05T14:00:00.000Z',
    receipt_number: 1044,
    hash: 'f0e1d2c3b4a59687786950413223140596877869504132231405968778695041',
    carrier: 'USPS Priority',
    tracking_number: '9400100000000000000000',
    fulfillment_status: 'delivered',
  },
];

export async function GET(req: Request) {
  const orchestratorUrl = getApiBaseUrl();
  if (orchestratorUrl) {
    try {
      const url = new URL(req.url);
      const res = await fetch(`${orchestratorUrl}/api/buyer/history${url.search}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unreachable for history; using fallback', { error: err?.message });
    }
  }

  return NextResponse.json({
    status: 'SUCCESS',
    orders: MOCK_HISTORY_ORDERS,
    history: MOCK_HISTORY_ORDERS,
  });
}
