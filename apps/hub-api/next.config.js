/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hub API is primarily an API server — disable React strict mode overhead
  reactStrictMode: false,
  // Workspace packages are pre-built (dist/) — no transpilePackages needed.
  // Using transpilePackages with NodeNext .js extensions causes webpack resolution failures.

  // Story 21.4: Security headers applied to ALL responses
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
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
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
        ],
      },
    ]
  },
}

export default nextConfig
