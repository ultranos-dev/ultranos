import { create } from 'zustand'
import type { FhirPatient } from '@ultranos/shared-types'

interface SyncStatus {
  isPending: boolean
  isError: boolean
  lastSyncedAt: string | null
}

interface PatientState {
  query: string
  results: FhirPatient[]
  selectedPatient: FhirPatient | null
  isSearching: boolean
  syncStatus: SyncStatus

  setQuery: (query: string) => void
  setResults: (results: FhirPatient[]) => void
  selectPatient: (patient: FhirPatient) => void
  clearSearch: () => void
  setIsSearching: (isSearching: boolean) => void
  setSyncStatus: (status: SyncStatus) => void
}

export const usePatientStore = create<PatientState>()((set) => ({
  query: '',
  results: [],
  selectedPatient: null,
  isSearching: false,
  syncStatus: { isPending: false, isError: false, lastSyncedAt: null },

  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
  selectPatient: (patient) => set({ selectedPatient: patient }),
  clearSearch: () => set({ query: '', results: [], isSearching: false }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
}))
