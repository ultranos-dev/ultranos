import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'
import { getSecurityHeaders } from '@ultranos/ui-kit'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Hub dev server runs on :3004 (matches opd-lite/pharmacy-lite). The previous
// :3000 default put the CSP connect-src on the wrong port, blocking the Hub in dev.
const hubApiOrigin = process.env.NEXT_PUBLIC_HUB_API_URL || 'http://localhost:3004'
const reportUri = process.env.CSP_REPORT_URI
// Supabase project origin — the Supabase client (auth/storage/realtime) connects
// to it, so it must be in CSP connect-src/img-src or it is blocked once enforced.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ultranos/shared-types', '@ultranos/ui-kit', '@ultranos/sync-engine'],
  webpack: (config) => {
    // NodeNext-style .js imports in workspace package source need to resolve to .ts/.tsx
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
  async headers() {
    return getSecurityHeaders({ hubApiOrigin, reportUri, supabaseOrigin })
  },
}

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(withNextIntl(nextConfig))
