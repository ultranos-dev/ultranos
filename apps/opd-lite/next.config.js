import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'
import { getSecurityHeaders } from '@ultranos/ui-kit'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const hubApiOrigin = process.env.NEXT_PUBLIC_HUB_API_URL || 'http://localhost:3004'
const reportUri = process.env.CSP_REPORT_URI
// Supabase project origin — patient photos load as signed URLs from Supabase
// Storage, and the Supabase client connects to it for auth/sync. Allow it in CSP.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ultranos/shared-types', '@ultranos/ui-kit', '@ultranos/sync-engine', '@ultranos/crypto'],
  async headers() {
    return getSecurityHeaders({ hubApiOrigin, reportUri, supabaseOrigin })
  },
  webpack: (config) => {
    // NodeNext-style .js imports in workspace package source need to resolve to .ts/.tsx
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
}

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(withNextIntl(nextConfig))
