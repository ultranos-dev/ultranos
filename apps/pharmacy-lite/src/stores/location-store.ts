import { create } from 'zustand'
import { db } from '@/lib/db'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'
import type { StockLocation } from '@/lib/inventory/types'

interface LocationState {
  locations: StockLocation[]
  currentLocationId: string   // a real id, or ALL_LOCATIONS
  loadLocations: () => Promise<void>
  setCurrentLocation: (id: string) => void
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: [],
  currentLocationId: '',
  loadLocations: async () => {
    const all = await db.stockLocations.toArray()
    const active = all.filter((l) => l.isActive)
    const current = get().currentLocationId
    const isValid = current === ALL_LOCATIONS || active.some((l) => l.id === current)
    let next = current
    if (!isValid) {
      const primary = active.find((l) => l.isPrimary)
      next = primary?.id ?? DEFAULT_LOCATION_ID
    }
    set({ locations: active, currentLocationId: next })
  },
  setCurrentLocation: (id) => set({ currentLocationId: id }),
}))
