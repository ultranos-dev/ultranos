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

// ---------------------------------------------------------------------------
// Background Sync wake-up bridge
// ---------------------------------------------------------------------------
//
// useBackgroundSync registers the Background Sync tag 'ultranos-sync-queue' and
// the Periodic Background Sync tag 'ultranos-periodic-sync'. Without a handler
// here those registrations were no-ops. We handle them by waking any open
// window client to run its in-page drain (the existing 'ultranos:sync-now'
// path).
//
// SECURITY BOUNDARY — by design the Service Worker does NOT decrypt or push PHI
// itself. The IndexedDB sync-queue payloads are encrypted with a session key
// that lives in page memory only and is cleared on tab/browser close (never in
// localStorage/IndexedDB — see CLAUDE.md encryption rules). The SW therefore
// cannot drain while the app is fully closed; it can only nudge a live client
// that still holds the key. Fully-closed background push is intentionally out
// of scope for that reason.

const SYNC_TAG = 'ultranos-sync-queue'
const PERIODIC_TAG = 'ultranos-periodic-sync'

/** Wake every open window client to run its in-page sync drain. */
async function wakeClientsToSync(): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of clients) {
    client.postMessage({ type: 'ULTRANOS_SYNC_TRIGGER' })
  }
}

// One-shot Background Sync (fires on connectivity restore).
self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string }
  if (syncEvent.tag === SYNC_TAG) {
    syncEvent.waitUntil(wakeClientsToSync())
  }
})

// Periodic Background Sync (fires on the browser's periodic schedule).
self.addEventListener('periodicsync' as keyof ServiceWorkerGlobalScopeEventMap, (event: Event) => {
  const periodicEvent = event as ExtendableEvent & { tag?: string }
  if (periodicEvent.tag === PERIODIC_TAG) {
    periodicEvent.waitUntil(wakeClientsToSync())
  }
})
