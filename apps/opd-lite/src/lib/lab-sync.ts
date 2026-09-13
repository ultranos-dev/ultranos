import type { LabDirectoryEntry } from '@ultranos/shared-types'
import { db } from './db'
import { getHubTrpcUrl } from '@/lib/hub-url'

// ---------------------------------------------------------------------------
// Interfaces (testable-core contract)
// ---------------------------------------------------------------------------

export interface LabStore {
  getCursor(key: string): Promise<string | undefined>
  setCursor(key: string, value: string): Promise<void>
  upsert(rows: LabDirectoryEntry[]): Promise<void>
}

export interface LabClient {
  sync(since?: string): Promise<{
    labs: LabDirectoryEntry[]
    latestUpdatedAt: string | null
  }>
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

const CURSOR_KEY = 'lastUpdatedAt'

/**
 * Testable core: pull lab directory delta from Hub and upsert into store.
 * Accepts injected store + client so tests can supply fakes without network/DB.
 */
export async function runLabSync(
  store: LabStore,
  client: LabClient,
): Promise<{ synced: number }> {
  const since = await store.getCursor(CURSOR_KEY)
  const { labs, latestUpdatedAt } = await client.sync(since)
  if (labs.length > 0) {
    await store.upsert(labs)
  }
  if (latestUpdatedAt) {
    await store.setCursor(CURSOR_KEY, latestUpdatedAt)
  }
  return { synced: labs.length }
}

// ---------------------------------------------------------------------------
// Dexie-backed store (production)
// ---------------------------------------------------------------------------

/**
 * Dexie-backed LabStore.
 * Cursor is stored in the existing `drugCatalogSyncMeta` table, namespaced
 * with the 'lab:' prefix — same mechanism as the drug-catalog and pharmacy
 * cursors, no new Dexie table required.
 */
class DexieLabStore implements LabStore {
  async getCursor(key: string): Promise<string | undefined> {
    const row = await db.drugCatalogSyncMeta.get(`lab:${key}`)
    return row?.value ?? undefined
  }

  async setCursor(key: string, value: string): Promise<void> {
    await db.drugCatalogSyncMeta.put({ key: `lab:${key}`, value })
  }

  async upsert(rows: LabDirectoryEntry[]): Promise<void> {
    await db.labsMirror.bulkPut(rows)
  }
}

export function createDexieLabStore(): LabStore {
  return new DexieLabStore()
}

// ---------------------------------------------------------------------------
// Hub client (production) — mirrors the pattern in pharmacy-sync / trpc.ts
// ---------------------------------------------------------------------------

function getHubApiUrl(): string {
  return getHubTrpcUrl()
}

/**
 * Creates a Hub client for the lab.syncDirectory tRPC procedure.
 * Lazy-imports Supabase at call time to avoid env-var throw at module load in tests.
 */
function createLabClient(): LabClient {
  return {
    async sync(since?: string) {
      const { getSupabaseBrowserClient } = await import('./supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      const token = data.session?.access_token

      const url = new URL(getHubApiUrl())
      url.pathname = url.pathname.replace(/\/$/, '') + '/lab.syncDirectory'
      const input: Record<string, unknown> = { limit: 500 }
      if (since) input.since = since
      url.searchParams.set('input', JSON.stringify({ json: input }))

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(url.toString(), { method: 'GET', headers })
      if (!res.ok) throw new Error(`lab.syncDirectory failed: ${res.status}`)

      const body = (await res.json()) as {
        result: { data: { json: { labs: LabDirectoryEntry[]; latestUpdatedAt: string | null } } }
      }
      return body.result.data.json
    },
  }
}

// ---------------------------------------------------------------------------
// Wired entry point: online-gated, single-flight, throttled (15 min)
// ---------------------------------------------------------------------------

export const LAB_SYNC_THROTTLE_MS = 15 * 60 * 1000

let running = false

/**
 * Fire-and-forget lab directory sync.
 * Online-gated, single-flight, throttled to LAB_SYNC_THROTTLE_MS.
 * Non-fatal: sync failures leave the existing local mirror intact.
 */
export async function syncLabDirectory(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  if (running) return
  running = true
  try {
    const store = createDexieLabStore()
    const lastSyncAt = await store.getCursor('lastSyncAt')
    if (lastSyncAt && Date.now() - Date.parse(lastSyncAt) < LAB_SYNC_THROTTLE_MS) return

    const client = createLabClient()
    await runLabSync(store, client)

    // Advance the throttle watermark after a successful sync.
    await store.setCursor('lastSyncAt', new Date().toISOString())
  } catch {
    // Sync failure is non-fatal — the mirror simply stays at its last version.
  } finally {
    running = false
  }
}
