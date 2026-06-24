import {
  createCatalogClient,
  runCatalogSync,
  runBrandSync,
  type CatalogClient,
  type DrugCatalogStore,
} from '@ultranos/drug-catalog-sync'
import { createDexieDrugCatalogStore } from './drug-catalog-store'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export const CATALOG_SYNC_THROTTLE_MS = 15 * 60 * 1000

export async function runDrugCatalogSync(
  store: DrugCatalogStore,
  client: CatalogClient,
): Promise<{ drugs: number; brands: number; presentations: number }> {
  const catalog = await runCatalogSync(store, client)
  let brands = 0
  let presentations = 0
  try {
    const b = await runBrandSync(store, client)
    brands = b.brandsSynced
    presentations = b.presentationsSynced
  } catch {
    // Brand sync is best-effort — never block the catalog sync on it.
  }
  return { drugs: catalog.drugsSynced, brands, presentations }
}

// Module-level single-flight lock — one inflight sync per page context (not cross-tab).
let running = false

/** Wired entry point: online-gated, single-flight, throttled (15 min). */
export async function syncDrugCatalog(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  if (running) return
  running = true
  try {
    const store = createDexieDrugCatalogStore()
    const lastSyncAt = await store.getCursor('lastSyncAt')
    if (lastSyncAt && Date.now() - Date.parse(lastSyncAt) < CATALOG_SYNC_THROTTLE_MS) return

    const client = createCatalogClient({
      baseUrl: getHubApiUrl(),
      getToken: async () => useAuthSessionStore.getState().getAccessToken(),
    })
    await runDrugCatalogSync(store, client)
  } catch {
    // Non-fatal — the mirror stays at its last version.
  } finally {
    running = false
  }
}
