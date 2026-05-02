import { create } from 'zustand'
import type { FhirPatient } from '@ultranos/shared-types'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

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
  setResults: (results) => {
    set({ results })
    if (results.length > 0) {
      auditPhiAccess(AuditAction.READ, AuditResourceType.PATIENT, 'search-results', undefined, {
        resultCount: results.length,
        phiAccess: 'patient_search',
      })
    }
  },
  selectPatient: (patient) => {
    set({ selectedPatient: patient })
    if (patient) {
      auditPhiAccess(AuditAction.READ, AuditResourceType.PATIENT, patient.id, patient.id, {
        phiAccess: 'patient_demographics_view',
      })
    }
  },
  clearSearch: () => set({ query: '', results: [], isSearching: false }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
}))
