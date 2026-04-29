/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hub API is primarily an API server — disable React strict mode overhead
  reactStrictMode: false,
  // Transpile monorepo packages
  transpilePackages: ['@ultranos/shared-types'],
}

export default nextConfig
