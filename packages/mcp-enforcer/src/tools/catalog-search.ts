import { z } from 'zod';
import { validatePublicImageUrl } from '../custom-tools.js';

/**
 * Sanitizes a raw search string by trimming whitespace, stripping non-printable
 * control characters and null bytes, and limiting overall character length.
 */
export function sanitizeSearchQuery(query: string): string {
  if (typeof query !== 'string') return '';
  // Strip control characters (ASCII 0-31 and 127) and null bytes
  const cleaned = query.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  // Bound max length to 200 characters
  return cleaned.slice(0, 200);
}

/**
 * Strict Zod input schema for Catalog Search tool.
 */
export const CatalogSearchInputSchema = z.object({
  query: z
    .string()
    .max(200, 'Search query must not exceed 200 characters')
    .transform(sanitizeSearchQuery)
    .optional(),
  category_ids: z
    .array(
      z
        .string()
        .min(1, 'Category ID must not be empty')
        .max(64, 'Category ID must not exceed 64 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Category ID contains invalid characters')
    )
    .max(20, 'Cannot query more than 20 categories simultaneously')
    .optional(),
  min_price_cents: z
    .number()
    .int('min_price_cents must be an integer')
    .min(0, 'min_price_cents cannot be negative')
    .max(10_000_000, 'min_price_cents exceeds maximum bounds ($100,000.00)')
    .optional(),
  max_price_cents: z
    .number()
    .int('max_price_cents must be an integer')
    .positive('max_price_cents must be greater than zero')
    .max(10_000_000, 'max_price_cents exceeds maximum bounds ($100,000.00)')
    .optional(),
  hex_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color format (must be #RGB or #RRGGBB)')
    .optional(),
  image_url: z
    .string()
    .url('Invalid image URL format')
    .max(1024, 'Image URL must not exceed 1024 characters')
    .refine((url) => validatePublicImageUrl(url), {
      message: 'SSRF protection: loopback, link-local, or private IP addresses are strictly rejected',
    })
    .optional(),
  limit: z
    .number()
    .int('limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  offset: z
    .number()
    .int('offset must be an integer')
    .min(0, 'Offset cannot be negative')
    .default(0),
}).refine(
  (data) => {
    if (data.min_price_cents !== undefined && data.max_price_cents !== undefined) {
      return data.max_price_cents >= data.min_price_cents;
    }
    return true;
  },
  {
    message: 'max_price_cents must be greater than or equal to min_price_cents',
    path: ['max_price_cents'],
  }
);

export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

export interface CatalogSearchProduct {
  id: string;
  title: string;
  description?: string;
  price_cents: number;
  merchant_domain: string;
  category_id?: string;
  image_url?: string;
}

export interface CatalogSearchResult {
  success: boolean;
  query?: string;
  total_matches: number;
  limit: number;
  offset: number;
  items: CatalogSearchProduct[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Handles catalog search with strict argument sanitation, boundary validation,
 * and safe error masking preventing stack traces or internal leaks.
 */
export async function handleCatalogSearch(
  rawArgs: unknown,
  executor?: (sanitized: CatalogSearchInput) => Promise<{ total: number; items: CatalogSearchProduct[] }>
): Promise<CatalogSearchResult> {
  try {
    const parseResult = CatalogSearchInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return {
        success: false,
        total_matches: 0,
        limit: 20,
        offset: 0,
        items: [],
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid search arguments',
        },
      };
    }

    const sanitized = parseResult.data;

    if (executor) {
      const { total, items } = await executor(sanitized);
      return {
        success: true,
        query: sanitized.query,
        total_matches: total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        items,
      };
    }

    // Default mock response when no external executor is supplied
    return {
      success: true,
      query: sanitized.query,
      total_matches: 0,
      limit: sanitized.limit,
      offset: sanitized.offset,
      items: [],
    };
  } catch (err: unknown) {
    // Safe error masking: Never leak internal error message or stack trace
    console.error('[MCP Enforcer:catalog-search] Masked unexpected error:', err instanceof Error ? err.message : String(err));
    return {
      success: false,
      total_matches: 0,
      limit: 20,
      offset: 0,
      items: [],
      error: {
        code: 'ERR_CATALOG_SEARCH_FAILED',
        message: 'The catalog search request failed due to an internal service error. Please retry.',
      },
    };
  }
}
