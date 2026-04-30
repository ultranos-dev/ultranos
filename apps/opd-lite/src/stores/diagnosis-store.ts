import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirCondition } from '@ultranos/shared-types'
import type { Icd10Item } from '@/lib/vocab-search'
import type { DiagnosisRank } from '@/lib/condition-mapper'
import { mapIcd10ToCondition } from '@/lib/condition-mapper'
import { db } from '@/lib/db'

interface DiagnosisState {
  conditions: FhirCondition[]
  isSaving: boolean

  addDiagnosis: (
    item: Icd10Item,
    encounterId: string,
    patientId: string,
    rank: DiagnosisRank,
  ) => Promise<FhirCondition>

  removeDiagnosis: (conditionId: string) => Promise<void>

  updateRank: (conditionId: string, rank: DiagnosisRank) => Promise<void>

  loadConditions: (encounterId: string) => Promise<void>

  clearPhiState: () => void
}

// Epoch counter — incremented by clearPhiState to invalidate in-flight writes
let storeEpoch = 0

function nextVersion(versionId: string | undefined): string {
  const parsed = parseInt(versionId ?? '0', 10)
  return String(Number.isFinite(parsed) ? parsed + 1 : 1)
}

export const useDiagnosisStore = create<DiagnosisState>()(
  immer((set, get) => ({
    conditions: [],
    isSaving: false,

    addDiagnosis: async (item, encounterId, patientId, rank) => {
      if (get().isSaving) {
        throw new Error('A diagnosis save is already in progress')
      }

      const epochAtStart = storeEpoch

      set((state) => {
        state.isSaving = true
      })

      const condition = mapIcd10ToCondition({
        item,
        encounterId,
        patientId,
        rank,
      })

      try {
        await db.conditions.put(condition)

        // Discard if clearPhiState was called while awaiting
        if (storeEpoch !== epochAtStart) return condition

        set((state) => {
          state.conditions.push(condition)
          state.isSaving = false
        })

        return condition
      } catch {
        if (storeEpoch === epochAtStart) {
          set((state) => {
            state.isSaving = false
          })
        }
        throw new Error('Failed to save diagnosis')
      }
    },

    removeDiagnosis: async (conditionId) => {
      const condition = get().conditions.find((c) => c.id === conditionId)
      if (!condition) return

      const nowIso = new Date().toISOString()

      // Soft-delete: transition clinicalStatus to inactive (Tier 1 append-only)
      const deactivated: FhirCondition = {
        ...condition,
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'inactive',
            },
          ],
        },
        meta: {
          ...condition.meta,
          lastUpdated: nowIso,
          versionId: nextVersion(condition.meta.versionId),
        },
      }

      try {
        await db.conditions.put(deactivated)
        set((state) => {
          state.conditions = state.conditions.filter(
            (c) => c.id !== conditionId,
          )
        })
      } catch {
        throw new Error('Failed to remove diagnosis')
      }
    },

    updateRank: async (conditionId, rank) => {
      const condition = get().conditions.find((c) => c.id === conditionId)
      if (!condition) return

      const nowIso = new Date().toISOString()

      const updated: FhirCondition = {
        ...condition,
        _ultranos: {
          ...condition._ultranos,
          diagnosisRank: rank,
        },
        meta: {
          ...condition.meta,
          lastUpdated: nowIso,
          versionId: nextVersion(condition.meta.versionId),
        },
      }

      try {
        await db.conditions.put(updated)
        set((state) => {
          const idx = state.conditions.findIndex((c) => c.id === conditionId)
          if (idx !== -1) {
            state.conditions[idx] = updated
          }
        })
      } catch {
        throw new Error('Failed to update diagnosis rank')
      }
    },

    loadConditions: async (encounterId) => {
      try {
        const conditions = await db.conditions
          .where('encounter.reference')
          .equals(`Encounter/${encounterId}`)
          .toArray()

        // Only show active conditions (soft-deleted ones have inactive status)
        const active = conditions.filter(
          (c) => c.clinicalStatus.coding[0]?.code === 'active',
        )

        set((state) => {
          state.conditions = active
        })
      } catch {
        set((state) => {
          state.conditions = []
        })
        throw new Error('Failed to load diagnoses')
      }
    },

    clearPhiState: () => {
      storeEpoch++
      set((state) => {
        state.conditions = []
        state.isSaving = false
      })
    },
  })),
)
