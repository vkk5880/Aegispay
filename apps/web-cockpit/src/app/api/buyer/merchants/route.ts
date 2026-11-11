import { NextResponse } from 'next/server';
import { apiLogger as logger } from '@/lib/logger';

export interface MerchantItem {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  logo_url: string;
  is_partner?: boolean;
  commission_rate?: number;
}

export const TOP_CURATED_MERCHANTS: MerchantItem[] = [
  {
    id: 'bestbuy',
    name: 'Best Buy',
    domain: 'bestbuy.com',
    category: 'electronics',
    description: 'Consumer electronics, computers, appliances, and smart home tech.',
    logo_url: 'https://cdn.trychannel3.com/491235d7-6600-42a5-bc6f-0eea016d327e',
    is_partner: true,
    commission_rate: 0.12,
  },
  {
    id: 'audio_gear_direct',
    name: 'Audio Gear Direct',
    domain: 'audio-gear-direct.com',
    category: 'audio',
    description: 'Audiophile headphones, studio monitors, DACs, and acoustic gear.',
    logo_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=128&q=80',
    is_partner: true,
    commission_rate: 0.15,
  },
  {
    id: 'nordic_workspaces',
    name: 'Nordic Workspaces',
    domain: 'nordic-workspaces.io',
    category: 'workspace',
    description: 'Ergonomic standing desks, walnut desk pads, and cable organizers.',
    logo_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=128&q=80',
    is_partner: true,
    commission_rate: 0.14,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    domain: 'amazon.com',
    category: 'general',
    description: 'Global marketplace for electronics, books, computing, and everyday goods.',
    logo_url: 'https://images.unsplash.com/photo-1523474255658-40e4ec45f921?w=128&q=80',
    is_partner: true,
    commission_rate: 0.08,
  },
  {
    id: 'apple',
    name: 'Apple Store',
    domain: 'apple.com',
    category: 'electronics',
    description: 'iPhone, Mac, iPad, Apple Watch, AirPods, and official accessories.',
    logo_url: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=128&q=80',
    is_partner: true,
    commission_rate: 0.05,
  },
  {
    id: 'bhphoto',
    name: 'B&H Photo Video',
    domain: 'bhphotovideo.com',
    category: 'audio',
    description: 'Professional audio, cameras, broadcast equipment, and computing.',
    logo_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=128&q=80',
    is_partner: true,
    commission_rate: 0.10,
  },
  {
    id: 'newegg',
    name: 'Newegg',
    domain: 'newegg.com',
    category: 'peripherals',
    description: 'PC parts, mechanical keyboards, gaming mice, monitors, and components.',
    logo_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=128&q=80',
    is_partner: true,
    commission_rate: 0.09,
  },
  {
    id: 'target',
    name: 'Target',
    domain: 'target.com',
    category: 'home',
    description: 'Home decor, furniture, office essentials, and consumer electronics.',
    logo_url: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=128&q=80',
    is_partner: true,
    commission_rate: 0.08,
  },
  {
    id: 'walmart',
    name: 'Walmart',
    domain: 'walmart.com',
    category: 'general',
    description: 'Everyday low prices on tech, household appliances, and stationery.',
    logo_url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=128&q=80',
    is_partner: true,
    commission_rate: 0.06,
  },
  {
    id: 'nike',
    name: 'Nike',
    domain: 'nike.com',
    category: 'apparel',
    description: 'Athletic footwear, sportswear, training gear, and street apparel.',
    logo_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=128&q=80',
    is_partner: true,
    commission_rate: 0.12,
  },
  {
    id: 'ebay',
    name: 'eBay',
    domain: 'ebay.com',
    category: 'general',
    description: 'Certified refurbished tech, collectibles, and global merchant inventory.',
    logo_url: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=128&q=80',
    is_partner: true,
    commission_rate: 0.07,
  },
  {
    id: 'steam',
    name: 'Steam',
    domain: 'steampowered.com',
    category: 'peripherals',
    description: 'Digital gaming, VR hardware, Steam Deck, and gaming peripherals.',
    logo_url: 'https://images.unsplash.com/photo-1612287233207-62885efdf1e2?w=128&q=80',
    is_partner: true,
    commission_rate: 0.10,
  },
  {
    id: 'homedepot',
    name: 'The Home Depot',
    domain: 'homedepot.com',
    category: 'home',
    description: 'Home improvement, workshop tools, smart lighting, and workspace storage.',
    logo_url: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?w=128&q=80',
    is_partner: true,
    commission_rate: 0.06,
  },
  {
    id: 'hollister',
    name: 'Hollister',
    domain: 'hollisterco.com',
    category: 'apparel',
    description: 'Casual apparel, outerwear, denim, and loungewear.',
    logo_url: 'https://cdn.trychannel3.com/15f7b69c-d7ee-480f-87ea-a1256fecf85e',
    is_partner: true,
    commission_rate: 0.10,
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

  logger.info('[BuyerMerchantsAPI:GET] Querying available merchants', { query, limit });

  let results: MerchantItem[] = [];
  let source: 'channel3' | 'curated' = 'curated';

  // 1. Attempt to query live Channel3 API if credentials exist
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (apiKey && apiKey !== 'your_channel3_api_key_here') {
    try {
      const { Channel3 } = await import('@channel3/sdk');
      const c3 = new Channel3({ apiKey });

      if (query) {
        const c3Search = await c3.websites.search({ query });
        const list = Array.isArray((c3Search as any)?.websites)
          ? (c3Search as any).websites
          : Array.isArray((c3Search as any)?.items)
          ? (c3Search as any).items
          : [];

        if (list.length > 0) {
          source = 'channel3';
          results = list.map((w: any) => ({
            id: String(w.id || w.url?.split('.')[0] || 'm_' + Math.random().toString(36).slice(2, 6)),
            name: String(w.name || w.url || 'Partner Store'),
            domain: String(w.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase(),
            category: 'general',
            description: String(w.description || `${w.name} online store`),
            logo_url: String(w.logo_url || 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=128&q=80'),
            is_partner: true,
            commission_rate: typeof w.best_commission_rate === 'number' ? w.best_commission_rate / 100 : 0.08,
          }));
        }
      } else {
        const c3List = await c3.websites.list({ limit });
        const items = Array.isArray((c3List as any)?.response?.items)
          ? (c3List as any).response.items
          : Array.isArray((c3List as any)?.items)
          ? (c3List as any).items
          : [];

        if (items.length > 0) {
          source = 'channel3';
          results = items.map((w: any) => ({
            id: String(w.id || w.url?.split('.')[0] || 'm_' + Math.random().toString(36).slice(2, 6)),
            name: String(w.name || w.url || 'Partner Store'),
            domain: String(w.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase(),
            category: 'general',
            description: String(w.description || `${w.name} online store`),
            logo_url: String(w.logo_url || 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=128&q=80'),
            is_partner: true,
            commission_rate: typeof w.best_commission_rate === 'number' ? w.best_commission_rate / 100 : 0.08,
          }));
        }
      }
    } catch (c3Err: any) {
      logger.warn('[BuyerMerchantsAPI:C3Fallback] Channel3 API fetch failed, falling back to curated list', {
        error: c3Err?.message,
      });
    }
  }

  // 2. Merge with curated merchants (ensuring deduplication and that top curated merchants are always present)
  const existingDomains = new Set(results.map((r) => r.domain));
  for (const curated of TOP_CURATED_MERCHANTS) {
    if (!existingDomains.has(curated.domain)) {
      if (!query ||
          curated.name.toLowerCase().includes(query) ||
          curated.domain.toLowerCase().includes(query) ||
          curated.category.toLowerCase().includes(query) ||
          curated.description.toLowerCase().includes(query)) {
        results.push(curated);
        existingDomains.add(curated.domain);
      }
    }
  }

  // 3. Filter by query if we had Channel3 raw items that didn't strictly filter
  if (query) {
    results = results.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.domain.toLowerCase().includes(query) ||
        m.category.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query)
    );
  }

  const sliced = results.slice(0, limit);

  return NextResponse.json({
    success: true,
    merchants: sliced,
    total: sliced.length,
    source,
  });
}
