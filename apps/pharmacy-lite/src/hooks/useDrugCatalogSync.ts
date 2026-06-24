import { useEffect } from 'react'
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'

/** Fire-and-forget enriched drug-catalog mirror refresh on mount (online-gated/throttled inside). */
export function useDrugCatalogSync(): void {
  useEffect(() => {
    void syncDrugCatalog()
  }, [])
}
