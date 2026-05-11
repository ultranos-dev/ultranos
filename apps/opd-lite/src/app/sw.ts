/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NetworkFirst, Serwist } from 'serwist'
import { ExpirationPlugin } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    // Self-hosted fonts — cache-first, 1-year TTL
    {
      matcher: ({ url }) => url.pathname.startsWith('/fonts/') && url.pathname.endsWith('.woff2'),
      handler: new CacheFirst({
        cacheName: 'fonts',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    // PWA icons — cache-first, 30-day expiry
    {
      matcher: ({ url }) => url.pathname.startsWith('/icons/') && url.pathname.endsWith('.png'),
      handler: new CacheFirst({
        cacheName: 'images',
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // API calls — network-first with 5s timeout
    // CRITICAL: Only cache non-PHI endpoints (drug-db lookups, terminology).
    // PHI (patient data, encounters, SOAP notes, prescriptions, allergies)
    // must NEVER be cached here — IndexedDB via Dexie is the only PHI store.
    {
      matcher: ({ url }) => {
        if (!url.pathname.startsWith('/api/trpc/')) return false
        // Allowlist: only cache endpoints that never return PHI
        const safePrefixes = ['drugDb.', 'terminology.', 'vocabulary.']
        const procedurePart = url.pathname.replace('/api/trpc/', '')
        return safePrefixes.some((prefix) => procedurePart.startsWith(prefix))
      },
      handler: new NetworkFirst({
        cacheName: 'api-calls',
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    // Default catch-all from Serwist (handles JS, CSS, HTML, etc.)
    ...defaultCache,
  ],
})

serwist.addEventListeners()
