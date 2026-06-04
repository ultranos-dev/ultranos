import { create } from 'zustand'

export type LocationType = 'lab' | 'pharmacy' | 'opd'

export interface Location {
  id: string
  name: string
  type: LocationType
}

export const ALL_LOCATIONS: Location = {
  id: '__all__',
  name: 'All Locations',
  type: 'lab',
}

interface LocationState {
  selected: Location
  locations: Location[]
  loading: boolean
  setSelected: (loc: Location) => void
  setLocations: (locs: Location[]) => void
  setLoading: (loading: boolean) => void
}

export const useLocationStore = create<LocationState>((set) => ({
  selected: ALL_LOCATIONS,
  locations: [],
  loading: true,
  setSelected: (loc) => set({ selected: loc }),
  setLocations: (locs) => set({ locations: locs }),
  setLoading: (loading) => set({ loading }),
}))
