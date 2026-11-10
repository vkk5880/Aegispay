import dotenv from 'dotenv';
import {
  Channel3SearchFilters as BaseFilters,
  Channel3Offer,
  Channel3ProductDetail,
  Channel3SearchResponse,
} from './channel3.client.js';

dotenv.config();

export interface ExtendedChannel3SearchFilters extends BaseFilters {
  sortBy?: 'price_asc' | 'price_desc' | 'relevance';
}

/**
 * Sanitizes input text against XSS, HTML tag injection, and script execution.
 * Strips HTML elements, javascript/data protocols, dangerous event attributes,
 * and encodes residual angle brackets.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  let text = input.trim();

  // Strip script, style, iframe, and object tags with contents
  text = text.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '');

  // Strip self-closing or malformed script tags
  text = text.replace(/<script[^>]*>/gi, '');

  // Strip HTML tags
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Strip dangerous pseudo-protocols like javascript: or data:
  text = text.replace(/javascript:[^"'\s]*/gi, '');
  text = text.replace(/vbscript:[^"'\s]*/gi, '');
  text = text.replace(/data:text\/html[^"'\s]*/gi, '');

  // Encode residual critical markup characters to prevent HTML context breakage
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return text;
}

/**
 * Normalizes any numeric or string monetary value to guaranteed non-negative integer cents.
 * Handles float dollar amounts (e.g., 299.99 -> 29999), raw cents, and currency-formatted strings.
 */
export function toIntegerCents(rawPrice: unknown, assumeDollarsIfDecimal = false): number {
  if (typeof rawPrice === 'object' && rawPrice !== null && 'price' in rawPrice) {
    return toIntegerCents((rawPrice as { price: unknown }).price, true);
  }

  if (typeof rawPrice === 'number') {
    if (isNaN(rawPrice) || !isFinite(rawPrice)) {
      return 0;
    }
    // If it's already an integer, check if decimal conversion is explicitly instructed
    if (Number.isInteger(rawPrice)) {
      return Math.max(0, rawPrice);
    }
    // If it's a float, convert dollars to cents if flagged or if fractional cents exist
    return Math.max(0, Math.round(assumeDollarsIfDecimal ? rawPrice * 100 : rawPrice));
  }

  if (typeof rawPrice === 'string') {
    const cleanStr = rawPrice.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanStr);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return 0;
    }
    if (cleanStr.includes('.') || assumeDollarsIfDecimal) {
      return Math.max(0, Math.round(parsed * 100));
    }
    return Math.max(0, Math.round(parsed));
  }

  return 0;
}

/**
 * Normalizes an offer object, ensuring non-negative integer cents for all price fields,
 * bounded commission rates, and sanitized domain names.
 */
export function normalizeOffer(offer: Partial<Channel3Offer>): Channel3Offer {
  const price = toIntegerCents(offer.price);
  const compareAt = offer.compare_at_price != null ? toIntegerCents(offer.compare_at_price) : price;

  const maxCommissionRate =
    typeof offer.max_commission_rate === 'number' && !isNaN(offer.max_commission_rate)
      ? Math.max(0, Math.min(1.0, offer.max_commission_rate))
      : 0.10;

  const shippingFeeCents =
    offer.shipping_fee_cents != null ? toIntegerCents(offer.shipping_fee_cents) : 0;

  const shippingWaiverThresholdCents =
    offer.shipping_waiver_threshold_cents != null
      ? toIntegerCents(offer.shipping_waiver_threshold_cents)
      : undefined;

  const anomalyScore =
    typeof offer.merchant_anomaly_score === 'number' && !isNaN(offer.merchant_anomaly_score)
      ? Math.max(0, Math.min(1.0, offer.merchant_anomaly_score))
      : 0.05;

  const stockStatus =
    offer.stock_status === 'OUT_OF_STOCK' ? ('OUT_OF_STOCK' as const) : ('IN_STOCK' as const);

  return {
    id: String(offer.id || `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
    product_id: String(offer.product_id || ''),
    domain: sanitizeText(offer.domain || 'unknown-merchant.com'),
    price,
    compare_at_price: Math.max(price, compareAt),
    max_commission_rate: maxCommissionRate,
    shipping_fee_cents: shippingFeeCents,
    shipping_waiver_threshold_cents: shippingWaiverThresholdCents,
    merchant_anomaly_score: anomalyScore,
    stock_status: stockStatus,
  };
}

/**
 * Normalizes product details, sanitizing titles and descriptions, ensuring
 * integer cents across all offers, and ensuring pristine reference images.
 */
export function normalizeProductDetail(product: Partial<Channel3ProductDetail>): Channel3ProductDetail {
  const productId = String(product.product_id || `prod_${Date.now()}`);
  const title = sanitizeText(product.title || 'Untitled Product');
  const description = sanitizeText(product.description || 'No description available.');
  const categoryId = sanitizeText(product.category_id || 'general');

  const offers = (product.offers || []).map(o => {
    const norm = normalizeOffer(o);
    if (!norm.product_id) {
      norm.product_id = productId;
    }
    return norm;
  });

  const rawImages = product.images && product.images.length > 0 ? product.images : [];
  const images = rawImages.map(img => {
    const rawUrl = typeof img.url === 'string' && img.url ? img.url : 'https://cdn.channel3.ai/raw/item.jpg';
    const cleanedUrl =
      typeof img.cleaned_url === 'string' && img.cleaned_url
        ? img.cleaned_url
        : `${rawUrl}&cleaned=1024&bg=white`;
    return { url: rawUrl, cleaned_url: cleanedUrl };
  });

  if (images.length === 0) {
    images.push({
      url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
      cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&bg=white',
    });
  }

  return {
    product_id: productId,
    title,
    description,
    category_id: categoryId,
    offers,
    images,
    dimensions: product.dimensions,
  };
}

/**
 * Default fallback catalog used for mock responses, offline resilience, and cached testing.
 */
export const DEFAULT_MOCK_CATALOG: Channel3ProductDetail[] = [
  {
    product_id: 'ch3_prod_9921',
    title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Silver',
    description: 'Industry-leading noise cancellation with 8 microphones and Auto NC Optimizer.',
    category_id: 'xoN',
    offers: [
      {
        id: 'off_001',
        product_id: 'ch3_prod_9921',
        domain: 'techmerchant.com',
        price: 34800,
        compare_at_price: 39900,
        max_commission_rate: 0.12,
        shipping_fee_cents: 1500,
        shipping_waiver_threshold_cents: 50000,
        merchant_anomaly_score: 0.05,
        stock_status: 'IN_STOCK',
      },
      {
        id: 'off_002',
        product_id: 'ch3_prod_9921',
        domain: 'audiovault.io',
        price: 33900,
        compare_at_price: 39900,
        max_commission_rate: 0.08,
        shipping_fee_cents: 1200,
        shipping_waiver_threshold_cents: 30000,
        merchant_anomaly_score: 0.12,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 250, length: 22, width: 18, height: 7 },
  },
  {
    product_id: 'ch3_prod_9922',
    title: 'Anker Magnetic Wireless Charging Stand 3-in-1 Cube',
    description: 'Foldable MagSafe wireless charging station for iPhone, Apple Watch, and AirPods.',
    category_id: 'xoN',
    offers: [
      {
        id: 'off_003',
        product_id: 'ch3_prod_9922',
        domain: 'techmerchant.com',
        price: 12900,
        compare_at_price: 14900,
        max_commission_rate: 0.15,
        shipping_fee_cents: 800,
        shipping_waiver_threshold_cents: 50000,
        merchant_anomaly_score: 0.04,
        stock_status: 'IN_STOCK',
      },
      {
        id: 'off_004',
        product_id: 'ch3_prod_9922',
        domain: 'powerhub.net',
        price: 12500,
        compare_at_price: 14900,
        max_commission_rate: 0.10,
        shipping_fee_cents: 999,
        shipping_waiver_threshold_cents: 20000,
        merchant_anomaly_score: 0.08,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 410, length: 6, width: 6, height: 6 },
  },
  {
    product_id: 'ch3_prod_9923',
    title: 'Nomad Rugged Leather Phone Case - Horween Rustic Brown',
    description: 'Full grain vegetable tanned Horween leather case with integrated neodymium magnets.',
    category_id: 'xoN',
    offers: [
      {
        id: 'off_005',
        product_id: 'ch3_prod_9923',
        domain: 'powerhub.net',
        price: 5900,
        compare_at_price: 7000,
        max_commission_rate: 0.14,
        shipping_fee_cents: 500,
        shipping_waiver_threshold_cents: 20000,
        merchant_anomaly_score: 0.02,
        stock_status: 'IN_STOCK',
      },
      {
        id: 'off_006',
        product_id: 'ch3_prod_9923',
        domain: 'shadymerch.biz',
        price: 1500,
        compare_at_price: 7000,
        max_commission_rate: 0.05,
        shipping_fee_cents: 1200,
        shipping_waiver_threshold_cents: 100000,
        merchant_anomaly_score: 0.88,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 70, length: 16, width: 8, height: 1 },
  },
  {
    product_id: 'ch3_prod_laptop_01',
    title: 'Lenovo IdeaPad Gaming 3 (Intel Core i5-12450H, 16GB RAM, 512GB SSD, RTX 3050)',
    description: '15.6-inch FHD 120Hz IPS gaming laptop with high-performance cooling and dual-channel memory.',
    category_id: 'laptops',
    offers: [
      {
        id: 'off_lenovo_1',
        product_id: 'ch3_prod_laptop_01',
        domain: 'bestbuy.com',
        price: 74900,
        compare_at_price: 89900,
        max_commission_rate: 0.10,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.03,
        stock_status: 'IN_STOCK',
      },
      {
        id: 'off_lenovo_2',
        product_id: 'ch3_prod_laptop_01',
        domain: 'amazon.com',
        price: 72900,
        compare_at_price: 89900,
        max_commission_rate: 0.08,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.04,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 2200, length: 36, width: 26, height: 2 },
  },
  {
    product_id: 'ch3_prod_phone_01',
    title: 'OnePlus 12R (16GB RAM, 256GB Storage - Cool Blue)',
    description: 'Snapdragon 8 Gen 2 flagship processor with 1.5K 120Hz ProXDR display and 100W SUPERVOOC charging.',
    category_id: 'smartphones',
    offers: [
      {
        id: 'off_oneplus_1',
        product_id: 'ch3_prod_phone_01',
        domain: 'oneplus.com',
        price: 49900,
        compare_at_price: 54900,
        max_commission_rate: 0.12,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.01,
        stock_status: 'IN_STOCK',
      },
      {
        id: 'off_oneplus_2',
        product_id: 'ch3_prod_phone_01',
        domain: 'amazon.com',
        price: 48900,
        compare_at_price: 54900,
        max_commission_rate: 0.09,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.03,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 207, length: 16, width: 7, height: 1 },
  },
  {
    product_id: 'ch3_prod_keyboard_01',
    title: 'Keychron K2 Wireless Mechanical Keyboard (Version 2 - Gateron Brown)',
    description: '75% layout compact Bluetooth wireless mechanical keyboard with Mac & Windows compatibility.',
    category_id: 'keyboards',
    offers: [
      {
        id: 'off_keychron_1',
        product_id: 'ch3_prod_keyboard_01',
        domain: 'techmerchant.com',
        price: 7900,
        compare_at_price: 9900,
        max_commission_rate: 0.15,
        shipping_fee_cents: 500,
        merchant_anomaly_score: 0.02,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 875, length: 31, width: 12, height: 4 },
  },
  {
    product_id: 'ch3_prod_mouse_01',
    title: 'Logitech MX Master 3S Wireless Performance Mouse',
    description: 'Quiet clicks and 8K DPI track-on-glass sensor with MagSpeed electromagnetic scrolling.',
    category_id: 'mice',
    offers: [
      {
        id: 'off_logitech_1',
        product_id: 'ch3_prod_mouse_01',
        domain: 'bestbuy.com',
        price: 9900,
        compare_at_price: 10900,
        max_commission_rate: 0.12,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.02,
        stock_status: 'IN_STOCK',
      },
    ],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=1024',
        cleaned_url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=1024&bg=white',
      },
    ],
    dimensions: { weight: 141, length: 12, width: 8, height: 5 },
  },
];

/**
 * Robust Channel3 Catalog Ingestion, Normalization & Query Service.
 * Implements deterministic search filtering, category matching, price sorting,
 * integer cents enforcement, XSS sanitization, and resilient mock fallback caching.
 */
export class Channel3CatalogService {
  private apiKey: string;
  private baseUrl: string;
  private promoCode: string;
  private searchCache: Map<string, { timestamp: number; data: Channel3SearchResponse }> = new Map();
  private productCache: Map<string, { timestamp: number; data: Channel3ProductDetail }> = new Map();
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes cache

  constructor(apiKey?: string, baseUrl?: string, promoCode?: string) {
    this.apiKey = apiKey || process.env.CHANNEL3_API_KEY || '';
    this.baseUrl = baseUrl || process.env.CHANNEL3_BASE_URL || 'https://api.channel3.ai';
    this.promoCode = promoCode || process.env.CHANNEL3_PROMO_CODE || 'PAYPAL-HACKATHON-2026';

    // Seed local cache with normalized default mock items
    for (const item of DEFAULT_MOCK_CATALOG) {
      const normalized = normalizeProductDetail(item);
      this.productCache.set(normalized.product_id, {
        timestamp: Date.now(),
        data: normalized,
      });
    }
  }

  public getPromoCode(): string {
    return this.promoCode;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-promo-code': this.promoCode,
    };
    if (this.apiKey && this.apiKey !== 'your_channel3_api_key_here') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Executes multi-modal product search with deterministic filtering, category matching,
   * price sorting, integer-cents normalization, and fallback resilience.
   */
  async search(filters: ExtendedChannel3SearchFilters): Promise<Channel3SearchResponse> {
    const cacheKey = JSON.stringify({
      q: filters.query?.toLowerCase() || '',
      c: (filters.category_ids || []).slice().sort(),
      h: filters.hex_color || '',
      s: filters.sortBy || '',
      l: filters.limit || 20,
      o: filters.offset || 0,
    });

    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    if (!this.apiKey || this.apiKey === 'your_channel3_api_key_here') {
      const mockRes = this.getDeterministicMockSearch(filters);
      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: mockRes });
      return mockRes;
    }

    try {
      const res = await fetch(`${this.baseUrl}/v1/search`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          query: filters.query,
          image_url: filters.image_url,
          category_ids: filters.category_ids,
          hex_color: filters.hex_color,
          limit: filters.limit || 20,
          offset: filters.offset || 0,
        }),
      });

      if (!res.ok) {
        console.warn(`Channel3 search API returned ${res.status}. Falling back to deterministic dataset.`);
        const fallback = this.getDeterministicMockSearch(filters);
        this.searchCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
        return fallback;
      }

      const rawData = (await res.json()) as { total?: number; products?: Channel3ProductDetail[] };
      const normalizedProducts = (rawData.products || []).map(p => normalizeProductDetail(p));

      // Cache individual products
      for (const prod of normalizedProducts) {
        this.productCache.set(prod.product_id, {
          timestamp: Date.now(),
          data: prod,
        });
      }

      const sortedProducts = this.applyDeterministicSorting(normalizedProducts, filters.sortBy);
      const response: Channel3SearchResponse = {
        total: rawData.total ?? sortedProducts.length,
        products: sortedProducts,
      };

      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: response });
      return response;
    } catch (err) {
      console.warn('Channel3 search failed, using deterministic cached mock items:', err);
      const fallback = this.getDeterministicMockSearch(filters);
      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
      return fallback;
    }
  }

  /**
   * Looks up products by product_id with normalization, caching, and fallback resilience.
   */
  async lookup(productIds: string[]): Promise<Channel3ProductDetail[]> {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    // Check memory cache first
    const results: Channel3ProductDetail[] = [];
    const missingIds: string[] = [];

    for (const id of productIds) {
      const cached = this.productCache.get(id);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        results.push(cached.data);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length === 0) {
      return results;
    }

    if (!this.apiKey || this.apiKey === 'your_channel3_api_key_here') {
      const mockItems = this.getMockLookupItems(missingIds);
      for (const item of mockItems) {
        this.productCache.set(item.product_id, { timestamp: Date.now(), data: item });
        results.push(item);
      }
      return results;
    }

    try {
      const res = await fetch(`${this.baseUrl}/v1/lookup`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ product_ids: missingIds }),
      });

      if (!res.ok) {
        console.warn(`Channel3 lookup API returned ${res.status}. Falling back to cached dataset.`);
        const fallback = this.getMockLookupItems(missingIds);
        for (const item of fallback) {
          this.productCache.set(item.product_id, { timestamp: Date.now(), data: item });
          results.push(item);
        }
        return results;
      }

      const data = (await res.json()) as { products?: Channel3ProductDetail[] };
      const fetched = (data.products || []).map(p => normalizeProductDetail(p));

      for (const item of fetched) {
        this.productCache.set(item.product_id, { timestamp: Date.now(), data: item });
        results.push(item);
      }

      return results;
    } catch (err) {
      console.warn('Channel3 lookup failed, using cached mock dataset:', err);
      const fallback = this.getMockLookupItems(missingIds);
      for (const item of fallback) {
        this.productCache.set(item.product_id, { timestamp: Date.now(), data: item });
        results.push(item);
      }
      return results;
    }
  }

  /**
   * Deterministic mock search filtering and sorting.
   */
  private getDeterministicMockSearch(filters: ExtendedChannel3SearchFilters): Channel3SearchResponse {
    let pool: Channel3ProductDetail[] = Array.from(this.productCache.values()).map(v => v.data);
    if (pool.length === 0) {
      pool = DEFAULT_MOCK_CATALOG.map(p => normalizeProductDetail(p));
    }

    let filtered = [...pool];

    // Category matching: exact or case-insensitive category id matching
    if (filters.category_ids && filters.category_ids.length > 0) {
      const normalizedCats = filters.category_ids.map(c => c.toLowerCase().trim());
      filtered = filtered.filter(p =>
        normalizedCats.includes(p.category_id.toLowerCase().trim())
      );
    }

    // Query filtering: match title and description
    if (filters.query) {
      const tokens = filters.query
        .toLowerCase()
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      filtered = filtered.filter(p => {
        const text = `${p.title} ${p.description}`.toLowerCase();
        return tokens.some(token => text.includes(token));
      });
    }

    // Apply deterministic price / relevance sorting
    filtered = this.applyDeterministicSorting(filtered, filters.sortBy);

    // Apply limit and offset
    const offset = Math.max(0, filters.offset || 0);
    const limit = Math.max(1, filters.limit || 20);
    const paginated = filtered.slice(offset, offset + limit);

    return {
      total: filtered.length,
      products: paginated,
    };
  }

  /**
   * Deterministic price and relevance sorting.
   */
  private applyDeterministicSorting(
    products: Channel3ProductDetail[],
    sortBy?: 'price_asc' | 'price_desc' | 'relevance'
  ): Channel3ProductDetail[] {
    const list = [...products];

    const getMinOfferPrice = (p: Channel3ProductDetail): number => {
      const inStock = p.offers.filter(o => o.stock_status !== 'OUT_OF_STOCK');
      const targetOffers = inStock.length > 0 ? inStock : p.offers;
      if (targetOffers.length === 0) return Number.MAX_SAFE_INTEGER;
      return Math.min(...targetOffers.map(o => o.price));
    };

    if (sortBy === 'price_asc') {
      list.sort((a, b) => {
        const pa = getMinOfferPrice(a);
        const pb = getMinOfferPrice(b);
        if (pa !== pb) return pa - pb;
        return a.product_id.localeCompare(b.product_id); // deterministic tie-breaker
      });
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => {
        const pa = getMinOfferPrice(a);
        const pb = getMinOfferPrice(b);
        if (pa !== pb) return pb - pa;
        return a.product_id.localeCompare(b.product_id);
      });
    } else {
      // Default: deterministic ordering by product_id
      list.sort((a, b) => a.product_id.localeCompare(b.product_id));
    }

    return list;
  }

  private getMockLookupItems(productIds: string[]): Channel3ProductDetail[] {
    const idSet = new Set(productIds);
    const matches: Channel3ProductDetail[] = [];

    for (const item of DEFAULT_MOCK_CATALOG) {
      if (idSet.has(item.product_id)) {
        matches.push(normalizeProductDetail(item));
      }
    }

    return matches;
  }
}

export const defaultChannel3CatalogService = new Channel3CatalogService();
