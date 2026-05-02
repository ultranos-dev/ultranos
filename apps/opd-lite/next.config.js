/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ultranos/shared-types', '@ultranos/ui-kit', '@ultranos/sync-engine', '@ultranos/crypto'],
  webpack: (config) => {
    // NodeNext-style .js imports in workspace package source need to resolve to .ts/.tsx
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
}

export default nextConfig
