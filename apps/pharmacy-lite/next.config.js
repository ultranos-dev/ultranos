import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'
import { getSecurityHeaders } from '@ultranos/ui-kit'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const hubApiOrigin = process.env.NEXT_PUBLIC_HUB_API_URL || 'http://localhost:3000'
const reportUri = process.env.CSP_REPORT_URI

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})

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
    return getSecurityHeaders({ hubApiOrigin, reportUri })
  },
}

export default withSerwist(withNextIntl(nextConfig))
