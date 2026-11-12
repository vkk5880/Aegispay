'use client';

import React, { useState } from 'react';
import type { ProductCardData } from '@aegispay/shared-types';
import { getProductImageUrl, FALLBACK_STUDIO_PLACEHOLDER } from '@/lib/productImageHelper';
import { ImageOff, Sparkles } from 'lucide-react';

export interface ProductImageProps {
  product: Partial<ProductCardData> | null | undefined;
  alt?: string;
  className?: string;
  containerClassName?: string;
  studioMode?: boolean;
  priority?: boolean;
}

export function ProductImage({
  product,
  alt,
  className = '',
  containerClassName = '',
  studioMode = false,
}: ProductImageProps) {
  const primarySrc = getProductImageUrl(product);
  const [currentSrc, setCurrentSrc] = useState<string>(primarySrc);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const resolvedAlt = alt || product?.title || 'Product Image';

  const handleError = () => {
    if (currentSrc !== FALLBACK_STUDIO_PLACEHOLDER) {
      setCurrentSrc(FALLBACK_STUDIO_PLACEHOLDER);
    } else {
      setHasError(true);
    }
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden flex items-center justify-center ${
        studioMode ? 'bg-white dark:bg-[#070d1a]' : 'bg-slate-100 dark:bg-slate-950'
      } ${containerClassName}`}
    >
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 dark:via-white/5 to-transparent animate-shimmer pointer-events-none" />
      )}

      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950">
          <ImageOff className="w-6 h-6 text-slate-400 dark:text-slate-600 mb-1" />
          <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400">
            AegisPay Verified Spec
          </span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={currentSrc}
          alt={resolvedAlt}
          onLoad={() => setIsLoaded(true)}
          onError={handleError}
          className={`w-full h-full transition-all duration-300 ${
            studioMode ? 'object-contain p-2' : 'object-cover object-center'
          } ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className}`}
        />
      )}
    </div>
  );
}
