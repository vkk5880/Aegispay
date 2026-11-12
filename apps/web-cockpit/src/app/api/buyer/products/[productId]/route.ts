import { NextResponse } from 'next/server';
import { DEFAULT_50_SEARCH_PRODUCTS } from '@/lib/searchCatalog';
import type { ProductCardData } from '@aegispay/shared-types';
import { apiLogger } from '@/lib/logger';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;

  if (!productId) {
    return NextResponse.json({ error: 'Missing product ID' }, { status: 400 });
  }

  // 1. Instant check in local 50 default products catalog (0ms First Contentful Paint)
  const localMatch = DEFAULT_50_SEARCH_PRODUCTS.find((p) => p.product_id === productId);

  // 2. Query Channel3 live API if API key exists
  const apiKey = process.env.CHANNEL3_API_KEY;
  const baseUrl = process.env.CHANNEL3_BASE_URL || 'https://api.trychannel3.com';

  if (apiKey && apiKey !== 'your_channel3_api_key_here') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s max timeout

      const res = await fetch(`${baseUrl}/v1/products/${encodeURIComponent(productId)}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'x-promo-code': process.env.CHANNEL3_PROMO_CODE || 'PAYPAL-HACKATHON-2026',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const liveData = await res.json();
        // Merge live offers and clean photos with local spec data
        const merged: ProductCardData = {
          ...(localMatch || {}),
          product_id: productId,
          title: liveData.title || localMatch?.title || 'Verified Product',
          description: liveData.description || localMatch?.description || '',
          category_id: liveData.category_id || localMatch?.category_id || 'general',
          price_cents: Math.round(
            (liveData.offers?.[0]?.price || (localMatch?.price_cents ? localMatch.price_cents / 100 : 99.99)) * 100
          ),
          compare_at_price_cents: Math.round(
            (liveData.offers?.[0]?.compare_at_price ||
              (localMatch?.compare_at_price_cents ? localMatch.compare_at_price_cents / 100 : 119.99)) * 100
          ),
          merchant_domain: liveData.offers?.[0]?.domain || localMatch?.merchant_domain || 'bestbuy.com',
          cleaned_url: liveData.images?.[0]?.cleaned_url || localMatch?.cleaned_url,
          cleaned_image_url: liveData.images?.[0]?.cleaned_url || localMatch?.cleaned_image_url,
          image_url: liveData.images?.[0]?.url || localMatch?.image_url,
          images: liveData.images || localMatch?.images,
          stock_status: (liveData.offers?.[0]?.stock_status as any) || localMatch?.stock_status || 'IN_STOCK',
          specs: liveData.specs || localMatch?.specs || {},
          variants: localMatch?.variants || [],
        };
        return NextResponse.json(merged, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        });
      }
    } catch (err: any) {
      apiLogger.warn(`Channel3 live lookup failed for ${productId}, falling back to local:`, err?.message);
    }
  }

  // 3. Fallback to local catalog
  if (localMatch) {
    return NextResponse.json(localMatch, {
      headers: { 'Cache-Control': 'public, s-maxage=300' },
    });
  }

  return NextResponse.json({ error: 'Product not found' }, { status: 404 });
}
