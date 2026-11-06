/**
 * Encodes a search result into a shareable URL.
 * All data is in the URL — no backend needed.
 * Format: /share?d={base64(json)}
 */

export interface ShareWinner {
  title: string;
  price: number;
  source: string;
  link: string;
  score: number;
  justification?: string;
  rating?: number;
  review_count?: number;
}

export interface ShareData {
  query: string;
  winner: ShareWinner;
  total_compared: number;
  timestamp: string;
}

export function encodeShareData(data: ShareData): string {
  const json = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeShareData(encoded: string): ShareData | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json) as ShareData;
  } catch {
    return null;
  }
}

export function buildShareUrl(data: ShareData): string {
  const encoded = encodeShareData(data);
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';
  return `${base}/share?d=${encodeURIComponent(encoded)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
