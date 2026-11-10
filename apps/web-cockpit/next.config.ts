import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aegispay/shared-types'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const rawApiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const orchestratorUrl = rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')
      ? rawApiUrl.replace(/\/+$/, '')
      : `https://${rawApiUrl}`.replace(/\/+$/, '');

    return [
      {
        source: '/api/buyer/history',
        destination: `${orchestratorUrl}/api/buyer/history`,
      },
      {
        source: '/api/buyer/receipts',
        destination: `${orchestratorUrl}/api/buyer/receipts`,
      },
      {
        source: '/api/buyer/watchlist',
        destination: `${orchestratorUrl}/api/buyer/watchlist`,
      },
      {
        source: '/api/buyer/watchlist/:path*',
        destination: `${orchestratorUrl}/api/buyer/watchlist/:path*`,
      },
      {
        source: '/api/buyer/escrow/:path*',
        destination: `${orchestratorUrl}/api/buyer/escrow/:path*`,
      },
      {
        source: '/api/buyer/clarify',
        destination: `${orchestratorUrl}/api/buyer/clarify`,
      },
      {
        source: '/api/buyer/enrich',
        destination: `${orchestratorUrl}/api/buyer/enrich`,
      },
      {
        source: '/api/buyer/prefs',
        destination: `${orchestratorUrl}/api/buyer/prefs`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.paypal.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: https://*.trychannel3.com https://cdn.trychannel3.com https://*.channel3.ai; font-src 'self' data:; connect-src 'self' https://*.paypal.com https://*.channel3.ai https://*.trychannel3.com https://api.trychannel3.com wss:; frame-ancestors 'none';",
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
