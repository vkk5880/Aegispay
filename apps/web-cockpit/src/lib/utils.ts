import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  if (typeof cents !== 'number' || isNaN(cents)) {
    return '$0.00';
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Resolves API URL safely, ensuring bare hostnames (e.g. from Render property: host)
 * are prefixed with https:// so browser fetch() does not treat them as relative paths.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || '';
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }
  return `https://${raw}`.replace(/\/+$/, '');
}
