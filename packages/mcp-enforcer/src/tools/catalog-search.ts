import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { validatePublicImageUrl } from '../custom-tools.js';

const logger = createLogger('MCP:Enforcer:CatalogSearch', { stream: 'stderr' });

/**
 * Sanitizes a raw search string by trimming whitespace, stripping non-printable
 * control characters and null bytes, and limiting overall character length.
 */
export function sanitizeSearchQuery(query: string): string {
  if (typeof query !== 'string') {
    logger.debug('Non-string search query provided, defaulting to empty string', { queryType: typeof query });
    return '';
  }

  const rawLength = query.length;
  // Strip control characters (ASCII 0-31 and 127) and null bytes
  const cleaned = query.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  const truncated = cleaned.slice(0, 200);

  logger.debug('Sanitized catalog search query', {
    rawLength,
    cleanedLength: cleaned.length,
    finalLength: truncated.length,
    wasTruncated: cleaned.length > 200,
  });

  return truncated;
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
    .refine((url) => {
      const isPublic = validatePublicImageUrl(url);
      if (!isPublic) {
        logger.warn('SSRF defense blocked image URL in catalog search input', {
          url: sanitizeForLogging(url),
        });
      } else {
        logger.debug('SSRF defense validated public image URL', {
          url: sanitizeForLogging(url),
        });
      }
      return isPublic;
    }, {
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
      const isValidRange = data.max_price_cents >= data.min_price_cents;
      if (!isValidRange) {
        logger.warn('Price range constraint violation: max_price_cents < min_price_cents', {
          min_price_cents: data.min_price_cents,
          max_price_cents: data.max_price_cents,
        });
      }
      return isValidRange;
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
  logger.info('Evaluating catalog search request', { rawArgs: sanitizeForLogging(rawArgs) });

  try {
    const parseResult = CatalogSearchInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const errorMessage = issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid search arguments';
      logger.warn('Catalog search input validation failed', {
        errorCount: parseResult.error.issues.length,
        primaryError: errorMessage,
        issues: parseResult.error.issues,
      });

      return {
        success: false,
        total_matches: 0,
        limit: 20,
        offset: 0,
        items: [],
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: errorMessage,
        },
      };
    }

    const sanitized = parseResult.data;
    logger.debug('Catalog search inputs parsed and sanitized successfully', {
      query: sanitized.query,
      categoryCount: sanitized.category_ids?.length ?? 0,
      minPrice: sanitized.min_price_cents,
      maxPrice: sanitized.max_price_cents,
      hasHexColor: Boolean(sanitized.hex_color),
      hasImageUrl: Boolean(sanitized.image_url),
      limit: sanitized.limit,
      offset: sanitized.offset,
    });

    if (executor) {
      logger.debug('Invoking custom catalog search executor');
      const { total, items } = await executor(sanitized);
      logger.info('Custom catalog search executor completed', {
        totalMatches: total,
        returnedItemsCount: items.length,
        limit: sanitized.limit,
        offset: sanitized.offset,
      });

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
    logger.debug('No external executor supplied, returning default mock response');
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
    logger.error('Masked unexpected error in catalog search handler', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

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
