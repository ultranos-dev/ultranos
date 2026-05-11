/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis

// PHI-bearing endpoints that must NEVER be cached
const PHI_PATTERNS = [
  /\/api\/trpc\/medication\./,
  /\/api\/trpc\/dispense\./,
  /\/api\/trpc\/prescription\./,
  /\/api\/trpc\/patient\./,
]

function isPhiRequest(url: string): boolean {
  return PHI_PATTERNS.some((pattern) => pattern.test(url))
}

// Filter defaultCache to exclude PHI routes from any caching rule
const safeDefaultCache: RuntimeCaching[] = defaultCache.map((entry) => {
  if (!entry.matcher) return entry
  const originalMatcher = entry.matcher
  return {
    ...entry,
    matcher: (options: { url: URL; request: Request; sameOrigin: boolean; event: ExtendableEvent }) => {
      if (isPhiRequest(options.url.pathname)) return false
      if (typeof originalMatcher === 'function') return originalMatcher(options)
      if (originalMatcher instanceof RegExp) return originalMatcher.test(options.url.href)
      return false
    },
  }
})

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Cache fonts — cache-first, long TTL
    {
      matcher: ({ request }) => request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'fonts-cache',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // Cache static assets — cache-first
    {
      matcher: ({ request }) =>
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'static-assets',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // Non-PHI API calls — network-first with 5s timeout
    {
      matcher: ({ url, sameOrigin }) => {
        if (!sameOrigin) return false
        if (!url.pathname.startsWith('/api/trpc/')) return false
        // NEVER cache PHI-bearing responses
        if (isPhiRequest(url.pathname)) return false
        return true
      },
      handler: new NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...safeDefaultCache,
  ],
})

// Handle SKIP_WAITING message from client for version updates
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

serwist.addEventListeners()
