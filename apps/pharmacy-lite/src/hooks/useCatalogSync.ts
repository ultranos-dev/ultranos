import { useEffect, useRef } from 'react'
import { syncCatalogFromHub } from '@/lib/inventory/catalog-sync'
import { useInventoryStore } from '@/stores/inventory-store'

export function useCatalogSync() {
  const setIsSyncingCatalog = useInventoryStore((s) => s.setIsSyncingCatalog)
  const setCatalogLastSynced = useInventoryStore((s) => s.setCatalogLastSynced)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!navigator.onLine) return

    const controller = new AbortController()
    abortRef.current = controller

    async function sync() {
      setIsSyncingCatalog(true)
      try {
        const result = await syncCatalogFromHub(controller.signal)
        if (!controller.signal.aborted) {
          setCatalogLastSynced(result.lastSyncedAt)
        }
      } catch {
        // Non-blocking — fail silently when offline or Hub unavailable
      } finally {
        if (!controller.signal.aborted) {
          setIsSyncingCatalog(false)
        }
      }
    }

    sync()
    return () => { controller.abort() }
  }, [setIsSyncingCatalog, setCatalogLastSynced])
}
