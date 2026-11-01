import dotenv from 'dotenv';
import { Channel3Item } from '@aegispay/shared-types';

dotenv.config();

export interface Channel3SearchFilters {
  query?: string;
  image_url?: string;
  category_ids?: string[];
  hex_color?: string;
  limit?: number;
  offset?: number;
}

export interface Channel3Offer {
  id: string;
  product_id: string;
  domain: string;
  price: number; // in cents or currency units
  compare_at_price: number;
  max_commission_rate: number; // e.g. 0.12 (12%)
  shipping_fee_cents?: number;
  shipping_waiver_threshold_cents?: number;
  merchant_anomaly_score?: number; // 0 to 1
  stock_status?: 'IN_STOCK' | 'OUT_OF_STOCK';
}

export interface Channel3ProductDetail {
  product_id: string;
  title: string;
  description: string;
  category_id: string;
  offers: Channel3Offer[];
  images: Array<{
    url: string;
    cleaned_url: string; // pristine studio reference image (white background, 1024px)
  }>;
  dimensions?: {
    weight?: number; // grams
    length?: number;
    width?: number;
    height?: number;
  };
}

export interface Channel3SearchResponse {
  total: number;
  products: Channel3ProductDetail[];
}

export class Channel3Client {
  private apiKey: string;
  private baseUrl: string;
  private promoCode: string;

  constructor(apiKey?: string, baseUrl?: string, promoCode?: string) {
    this.apiKey = apiKey || process.env.CHANNEL3_API_KEY || '';
    this.baseUrl = baseUrl || process.env.CHANNEL3_BASE_URL || 'https://api.channel3.ai';
    this.promoCode = promoCode || 'PAYPAL-HACKATHON-2026';
  }

  private getHeaders(): Record<string, string> {
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
   * Channel3 /v1/search (text query, inspiration image_url, category_ids, and hex color)
   */
  async search(filters: Channel3SearchFilters): Promise<Channel3SearchResponse> {
    if (!this.apiKey || this.apiKey === 'your_channel3_api_key_here') {
      return this.getMockSearchResponse(filters);
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
        return this.getMockSearchResponse(filters);
      }

      return await res.json() as Channel3SearchResponse;
    } catch (err) {
      console.warn('Channel3 search failed, using deterministic mock items:', err);
      return this.getMockSearchResponse(filters);
    }
  }

  /**
   * Channel3 /v1/lookup with product IDs
   */
  async lookup(productIds: string[]): Promise<Channel3ProductDetail[]> {
    if (!this.apiKey || this.apiKey === 'your_channel3_api_key_here') {
      return this.getMockLookupResponse(productIds);
    }

    try {
      const res = await fetch(`${this.baseUrl}/v1/lookup`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          product_ids: productIds,
        }),
      });

      if (!res.ok) {
        console.warn(`Channel3 lookup API returned ${res.status}. Falling back to deterministic dataset.`);
        return this.getMockLookupResponse(productIds);
      }

      const data = await res.json() as { products: Channel3ProductDetail[] };
      return data.products || [];
    } catch (err) {
      console.warn('Channel3 lookup failed, using deterministic mock items:', err);
      return this.getMockLookupResponse(productIds);
    }
  }

  private getMockSearchResponse(filters: Channel3SearchFilters): Channel3SearchResponse {
    const mockProducts: Channel3ProductDetail[] = [
      {
        product_id: 'ch3_prod_9921',
        title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Silver',
        description: 'Industry-leading noise cancellation with 8 microphones and Auto NC Optimizer.',
        category_id: filters.category_ids?.[0] || 'xoN',
        offers: [
          {
            id: 'off_001',
            product_id: 'ch3_prod_9921',
            domain: 'techmerchant.com',
            price: 34800, // $348.00 in cents
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
            price: 33900, // $339.00
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
        dimensions: {
          weight: 250,
          length: 22,
          width: 18,
          height: 7,
        },
      },
      {
        product_id: 'ch3_prod_9922',
        title: 'Anker Magnetic Wireless Charging Stand 3-in-1 Cube',
        description: 'Foldable MagSafe wireless charging station for iPhone, Apple Watch, and AirPods.',
        category_id: filters.category_ids?.[0] || 'xoN',
        offers: [
          {
            id: 'off_003',
            product_id: 'ch3_prod_9922',
            domain: 'techmerchant.com',
            price: 12900, // $129.00
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
            price: 12500, // $125.00
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
        dimensions: {
          weight: 410,
          length: 6,
          width: 6,
          height: 6,
        },
      },
      {
        product_id: 'ch3_prod_9923',
        title: 'Nomad Rugged Leather Phone Case - Horween Rustic Brown',
        description: 'Full grain vegetable tanned Horween leather case with integrated neodymium magnets.',
        category_id: filters.category_ids?.[0] || 'xoN',
        offers: [
          {
            id: 'off_005',
            product_id: 'ch3_prod_9923',
            domain: 'powerhub.net',
            price: 5900, // $59.00
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
            price: 1500, // Anomaly flag: $15 vs $70 compare price (>80% markdown)
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
        dimensions: {
          weight: 70,
          length: 16,
          width: 8,
          height: 1,
        },
      },
    ];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      const filtered = mockProducts.filter(p =>
        p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
      if (filtered.length > 0) {
        return { total: filtered.length, products: filtered };
      }
    }

    return { total: mockProducts.length, products: mockProducts };
  }

  private getMockLookupResponse(productIds: string[]): Channel3ProductDetail[] {
    const fullSet = this.getMockSearchResponse({}).products;
    return fullSet.filter(p => productIds.includes(p.product_id));
  }
}

export const defaultChannel3Client = new Channel3Client();
