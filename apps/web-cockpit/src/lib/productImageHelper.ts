import type { ProductCardData } from '@aegispay/shared-types';

export const FALLBACK_STUDIO_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none"><rect width="400" height="400" fill="%23F1F5F9"/><path d="M160 140H240V220H160V140Z" stroke="%2394A3B8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="185" cy="165" r="10" fill="%2394A3B8"/><path d="M160 210L190 180L215 205L225 195L240 210" stroke="%2394A3B8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><text x="200" y="270" font-family="monospace" font-size="14" font-weight="bold" fill="%2364748B" text-anchor="middle">AEGISPAY VERIFIED SPEC</text></svg>';

/**
 * Returns the highest-priority pristine image URL for a product with 4-tier fallback cascade:
 * cleaned_url -> cleaned_image_url -> image_url -> images[0] -> FALLBACK_STUDIO_PLACEHOLDER
 */
export function getProductImageUrl(product: Partial<ProductCardData> | null | undefined): string {
  if (!product) return FALLBACK_STUDIO_PLACEHOLDER;

  // 1. Pristine studio cleaned URL
  if (product.cleaned_url && typeof product.cleaned_url === 'string' && product.cleaned_url.trim().length > 0) {
    return product.cleaned_url.trim();
  }

  // 2. Channel3 cleaned_image_url
  if (product.cleaned_image_url && typeof product.cleaned_image_url === 'string' && product.cleaned_image_url.trim().length > 0) {
    return product.cleaned_image_url.trim();
  }

  // 3. Raw image_url
  if (product.image_url && typeof product.image_url === 'string' && product.image_url.trim().length > 0) {
    return product.image_url.trim();
  }

  // 4. Images array (first item cleaned_url or url)
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0] as any;
    if (typeof first === 'object' && first !== null) {
      if (first.cleaned_url && typeof first.cleaned_url === 'string' && first.cleaned_url.trim().length > 0) {
        return first.cleaned_url.trim();
      }
      if (first.url && typeof first.url === 'string' && first.url.trim().length > 0) {
        return first.url.trim();
      }
    } else if (typeof first === 'string' && first.trim().length > 0) {
      return first.trim();
    }
  }

  return FALLBACK_STUDIO_PLACEHOLDER;
}

/**
 * Collects and deduplicates all product image assets into an ordered array suitable for multi-angle studio galleries.
 */
export function getAllProductImages(product: Partial<ProductCardData> | null | undefined): string[] {
  if (!product) return [FALLBACK_STUDIO_PLACEHOLDER];

  const set = new Set<string>();

  if (product.cleaned_url?.trim()) set.add(product.cleaned_url.trim());
  if (product.cleaned_image_url?.trim()) set.add(product.cleaned_image_url.trim());
  if (product.image_url?.trim()) set.add(product.image_url.trim());

  if (Array.isArray(product.images)) {
    for (const img of product.images as any[]) {
      if (typeof img === 'object' && img !== null) {
        if (img.cleaned_url?.trim()) set.add(img.cleaned_url.trim());
        if (img.url?.trim()) set.add(img.url.trim());
      } else if (typeof img === 'string' && img.trim()) {
        set.add(img.trim());
      }
    }
  }

  const results = Array.from(set);
  return results.length > 0 ? results : [FALLBACK_STUDIO_PLACEHOLDER];
}
