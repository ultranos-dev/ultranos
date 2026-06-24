import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncDrugCatalog = vi.fn(async () => {})
vi.mock('@/lib/drug-catalog-sync', () => ({ syncDrugCatalog }))

// SyncProvider imports supabase at module level — mock it to avoid env-var throw.
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  }),
}))

beforeEach(() => { syncDrugCatalog.mockClear() })

describe('SyncProvider catalog trigger', () => {
  it('calls syncDrugCatalog when authenticated', async () => {
    // Importing after the mock is registered; the provider effect calls the trigger.
    const { triggerCatalogSyncOnAuth } = await import('@/components/providers/SyncProvider')
    await triggerCatalogSyncOnAuth(true)
    expect(syncDrugCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not call it when unauthenticated', async () => {
    const { triggerCatalogSyncOnAuth } = await import('@/components/providers/SyncProvider')
    await triggerCatalogSyncOnAuth(false)
    expect(syncDrugCatalog).not.toHaveBeenCalled()
  })
})
