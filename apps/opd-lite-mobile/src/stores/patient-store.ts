/**
 * Zustand v5 store for patient search and selection.
 * All queries go against the local SQLCipher database — no network required.
 */
import { create } from 'zustand'

import type { FhirPatient } from '@ultranos/shared-types'

import { getDatabase } from '../lib/db'
import { auditPatientRead } from '../lib/audit'
import { hashNationalId } from '../lib/hash-national-id'

export interface PatientStoreState {
  query: string
  results: FhirPatient[]
  selectedPatient: FhirPatient | null
  isSearching: boolean
  syncStatus: {
    isPending: boolean
    isError: boolean
    lastSyncedAt: string | null
  }
}

export interface PatientStoreActions {
  searchPatients: (query: string) => Promise<void>
  selectPatient: (id: string) => void
  clearSearch: () => void
}

export type PatientStore = PatientStoreState & PatientStoreActions

export const usePatientStore = create<PatientStore>((set, get) => ({
  // State
  query: '',
  results: [],
  selectedPatient: null,
  isSearching: false,
  syncStatus: {
    isPending: false,
    isError: false,
    lastSyncedAt: null,
  },

  // Actions
  searchPatients: async (query: string) => {
    set({ query, isSearching: true })

    if (!query.trim()) {
      set({ results: [], isSearching: false })
      return
    }

    const db = await getDatabase()
    const trimmed = query.trim()
    const searchTerm = `%${trimmed}%`

    // Hash the query for National ID comparison (stored as SHA-256)
    const queryHash = await hashNationalId(trimmed)

    const rows = await db.getAllAsync<{ fhir_json: string }>(
      `SELECT fhir_json FROM patients
       WHERE name_local LIKE ? OR name_text LIKE ? OR national_id_hash = ?
       ORDER BY meta_last_updated DESC
       LIMIT 50`,
      [searchTerm, searchTerm, queryHash]
    )

    const results = rows.map((row) => JSON.parse(row.fhir_json) as FhirPatient)
    set({ results, isSearching: false })

    // Audit: emit PHI_READ for every patient record displayed in search results (AC #8)
    const now = new Date().toISOString()
    for (const patient of results) {
      auditPatientRead(patient.id, 'PRACTITIONER_REF', now, 'search')
    }
  },

  selectPatient: (id: string) => {
    const { results } = get()
    const patient = results.find((p) => p.id === id) ?? null
    set({ selectedPatient: patient })
  },

  clearSearch: () => {
    set({ query: '', results: [], selectedPatient: null })
  },
}))
