import type { PharmacyDirectoryEntry } from '@ultranos/shared-types'
import { db } from './db'
import { getHubTrpcUrl } from '@/lib/hub-url'

// ---------------------------------------------------------------------------
// Interfaces (testable-core contract)
// ---------------------------------------------------------------------------

export interface PharmacyStore {
  getCursor(key: string): Promise<string | undefined>
  setCursor(key: string, value: string): Promise<void>
  upsert(rows: PharmacyDirectoryEntry[]): Promise<void>
}

export interface PharmacyClient {
  sync(since?: string): Promise<{
    pharmacies: PharmacyDirectoryEntry[]
    latestUpdatedAt: string | null
  }>
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

const CURSOR_KEY = 'lastUpdatedAt'

/**
 * Testable core: pull pharmacy directory delta from Hub and upsert into store.
 * Accepts injected store + client so tests can supply fakes without network/DB.
 */
export async function runPharmacySync(
  store: PharmacyStore,
  client: PharmacyClient,
): Promise<{ synced: number }> {
  const since = await store.getCursor(CURSOR_KEY)
  const { pharmacies, latestUpdatedAt } = await client.sync(since)
  if (pharmacies.length > 0) {
    await store.upsert(pharmacies)
  }
  if (latestUpdatedAt) {
    await store.setCursor(CURSOR_KEY, latestUpdatedAt)
  }
  return { synced: pharmacies.length }
}

// ---------------------------------------------------------------------------
// Dexie-backed store (production)
// ---------------------------------------------------------------------------

/**
 * Dexie-backed PharmacyStore.
 * Cursor is stored in the existing `drugCatalogSyncMeta` table, namespaced
 * with the 'pharmacy:' prefix — same mechanism as the drug-catalog cursor,
 * no new Dexie table required.
 */
class DexiePharmacyStore implements PharmacyStore {
  async getCursor(key: string): Promise<string | undefined> {
    const row = await db.drugCatalogSyncMeta.get(`pharmacy:${key}`)
    return row?.value ?? undefined
  }

  async setCursor(key: string, value: string): Promise<void> {
    await db.drugCatalogSyncMeta.put({ key: `pharmacy:${key}`, value })
  }

  async upsert(rows: PharmacyDirectoryEntry[]): Promise<void> {
    await db.pharmaciesMirror.bulkPut(rows)
  }
}

export function createDexiePharmacyStore(): PharmacyStore {
  return new DexiePharmacyStore()
}

// ---------------------------------------------------------------------------
// Hub client (production) — mirrors the pattern in searchDrugCatalog / trpc.ts
// ---------------------------------------------------------------------------

function getHubApiUrl(): string {
  return getHubTrpcUrl()
}

/**
 * Creates a Hub client for the pharmacy.sync tRPC procedure.
 * Lazy-imports Supabase at call time to avoid env-var throw at module load in tests.
 */
function createPharmacyClient(): PharmacyClient {
  return {
    async sync(since?: string) {
      const { getSupabaseBrowserClient } = await import('./supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      const token = data.session?.access_token

      const url = new URL(getHubApiUrl())
      url.pathname = url.pathname.replace(/\/$/, '') + '/pharmacy.sync'
      const input: Record<string, unknown> = { limit: 500 }
      if (since) input.since = since
      url.searchParams.set('input', JSON.stringify({ json: input }))

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(url.toString(), { method: 'GET', headers })
      if (!res.ok) throw new Error(`pharmacy.sync failed: ${res.status}`)

      const body = (await res.json()) as {
        result: { data: { json: { pharmacies: PharmacyDirectoryEntry[]; latestUpdatedAt: string | null } } }
      }
      return body.result.data.json
    },
  }
}

// ---------------------------------------------------------------------------
// Wired entry point: online-gated, single-flight, throttled (15 min)
// ---------------------------------------------------------------------------

export const PHARMACY_SYNC_THROTTLE_MS = 15 * 60 * 1000

let running = false

/**
 * Fire-and-forget pharmacy directory sync.
 * Online-gated, single-flight, throttled to PHARMACY_SYNC_THROTTLE_MS.
 * Non-fatal: sync failures leave the existing local mirror intact.
 */
export async function syncPharmacyDirectory(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  if (running) return
  running = true
  try {
    const store = createDexiePharmacyStore()
    const lastSyncAt = await store.getCursor('lastSyncAt')
    if (lastSyncAt && Date.now() - Date.parse(lastSyncAt) < PHARMACY_SYNC_THROTTLE_MS) return

    const client = createPharmacyClient()
    await runPharmacySync(store, client)

    // Advance the throttle watermark after a successful sync.
    await store.setCursor('lastSyncAt', new Date().toISOString())
  } catch {
    // Sync failure is non-fatal — the mirror simply stays at its last version.
  } finally {
    running = false
  }
}
