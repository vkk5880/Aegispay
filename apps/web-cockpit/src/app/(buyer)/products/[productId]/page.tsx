'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, ShieldCheck, Loader2 } from 'lucide-react';
import { ProductDetailContent } from '@/components/buyer/ProductDetailContent';
import { DEFAULT_50_SEARCH_PRODUCTS } from '@/lib/searchCatalog';
import type { ProductCardData } from '@aegispay/shared-types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = (params?.productId as string) || '';
  const { addToCart, openCart } = useCart();
  const { user, recordPurchaseSpend } = useAuth();

  const [product, setProduct] = useState<ProductCardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;

    // Instant local match for 0ms render
    const localMatch = DEFAULT_50_SEARCH_PRODUCTS.find((p) => p.product_id === productId);
    if (localMatch) {
      setProduct(localMatch);
      setLoading(false);
    }

    // Background fetch for hydrated data
    fetch(`/api/buyer/products/${encodeURIComponent(productId)}`)
      .then((res) => {
        if (!res.ok) {
          if (!localMatch) throw new Error('Product not found');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setProduct(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!localMatch) {
          setError(err.message || 'Product not found');
        }
      })
      .finally(() => setLoading(false));
  }, [productId]);

  const handleInstantBuy = async (item: ProductCardData) => {
    addToCart(item, 1);
    openCart();
  };

  if (loading && !product) {
    return (
      <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        <p className="text-sm font-mono text-slate-500">Loading AegisPay Studio Spec...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Product Not Found</h2>
        <p className="text-xs text-slate-500 max-w-sm">
          The requested product identifier does not exist or has been archived from Channel3 indexes.
        </p>
        <Link
          href="/search"
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Product Search</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 py-6 px-4 sm:px-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalog</span>
        </button>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            Explore More Items
          </Link>
        </div>
      </div>

      <ProductDetailContent product={product} onInstantBuy={handleInstantBuy} />
    </div>
  );
}
