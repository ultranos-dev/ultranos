import { create } from 'zustand'

interface StockAlerts {
  lowStockCount: number
  nearExpiryCount: number
  quarantinedCount: number
}

interface InventoryState {
  alerts: StockAlerts
  catalogLastSynced: string | null
  isSyncingCatalog: boolean
  setAlerts: (alerts: StockAlerts) => void
  setCatalogLastSynced: (timestamp: string) => void
  setIsSyncingCatalog: (syncing: boolean) => void
}

export const useInventoryStore = create<InventoryState>((set) => ({
  alerts: { lowStockCount: 0, nearExpiryCount: 0, quarantinedCount: 0 },
  catalogLastSynced: null,
  isSyncingCatalog: false,
  setAlerts: (alerts) => set({ alerts }),
  setCatalogLastSynced: (timestamp) => set({ catalogLastSynced: timestamp }),
  setIsSyncingCatalog: (syncing) => set({ isSyncingCatalog: syncing }),
}))
