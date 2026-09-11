import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'
import { hlc, serializeHlc } from '@/lib/hlc'
import { fetchPatientAllergiesFromHub } from '@/lib/trpc'

interface AllergyState {
  allergies: FhirAllergyIntolerance[]
  isLoading: boolean
  loadError: string | null

  loadAllergies: (patientId: string) => Promise<void>
  addAllergy: (allergy: FhirAllergyIntolerance) => Promise<void>
  updateAllergyStatus: (
    id: string,
    newStatus: 'active' | 'inactive' | 'resolved',
  ) => Promise<void>
  clearPhiState: () => void
}

let storeEpoch = 0

export const useAllergyStore = create<AllergyState>()(
  immer((set, get) => ({
    allergies: [],
    isLoading: false,
    loadError: null,

    loadAllergies: async (patientId) => {
      // P25 — Concurrent loadAllergies guard: prevents parallel loads for the same
      // patient. Callers MUST call clearPhiState() before calling loadAllergies() for
      // a new patient — clearPhiState() resets isLoading to false, which allows the
      // new load to proceed. Without that reset, a second patient's load would be
      // silently swallowed here.
      if (get().isLoading) return

      // P1 — Clear stale state immediately before async fetch so old patient's
      // allergies are not visible during the transition
      const epochAtStart = storeEpoch
      set((state) => {
        state.allergies = []
        state.isLoading = true
        state.loadError = null
      })

      // Keep only clinically-active records for display (all versions stay in the DB
      // for append-only history). P26 — warn on empty coding rather than silently drop.
      const activeOnly = (records: FhirAllergyIntolerance[]) =>
        records.filter((a) => {
          if (a.clinicalStatus.coding.length === 0) {
            console.warn('[allergy-store] clinicalStatus.coding is empty — record excluded from active list', {
              resourceType: a.resourceType,
              hasId: typeof a.id === 'string',
            })
            return false
          }
          return a.clinicalStatus.coding[0]?.code === 'active'
        })

      // 1. Local-first: render the cached allergies immediately (offline-safe, instant).
      let localReadOk = false
      let localActive: FhirAllergyIntolerance[] = []
      try {
        const records = await db.allergyIntolerances
          .where('patient.reference')
          .equals(`Patient/${patientId}`)
          .toArray()
        localReadOk = true
        localActive = activeOnly(records)
        if (storeEpoch !== epochAtStart) return
        set((state) => {
          state.allergies = localActive
        })
      } catch {
        /* local read failed — the Hub reconcile below is the fallback */
      }

      // 2. Hub-authoritative reconcile. Allergies are Tier-1 safety-critical, so their
      //    display must not depend solely on best-effort background sync (which can lag
      //    or be blocked by a stale/poisoned watermark). When online, the Hub is the
      //    source of truth; cache the result locally for the next offline view.
      let hubAllergies: FhirAllergyIntolerance[] | null = null
      try {
        hubAllergies = await fetchPatientAllergiesFromHub(patientId)
      } catch {
        hubAllergies = null
      }
      if (storeEpoch !== epochAtStart) return

      if (hubAllergies !== null) {
        try {
          for (const a of hubAllergies) await db.allergyIntolerances.put(a)
        } catch {
          /* caching is best-effort — the in-memory list below is still authoritative */
        }
        if (storeEpoch !== epochAtStart) return
        const active = activeOnly(hubAllergies)
        try {
          auditPhiAccess(AuditAction.READ, AuditResourceType.ALLERGY, patientId, patientId, {
            phiAccess: 'allergy_view',
            allergyCount: active.length,
            source: 'hub',
          })
        } catch { /* auditPhiAccess is documented non-throwing */ }
        set((state) => {
          state.allergies = active
          state.isLoading = false
        })
        return
      }

      // 3. Hub unreachable (offline / no session) — keep the local cache.
      try {
        auditPhiAccess(AuditAction.READ, AuditResourceType.ALLERGY, patientId, patientId, {
          phiAccess: 'allergy_view',
          allergyCount: localActive.length,
          source: 'local',
        })
      } catch { /* auditPhiAccess is documented non-throwing */ }
      set((state) => {
        state.allergies = localActive
        state.isLoading = false
        // CLAUDE.md Rule #3: if we could neither read local nor reach the Hub, never
        // imply "no known allergies" — surface the unavailable state instead.
        if (!localReadOk) state.loadError = 'Failed to load allergy data'
      })
    },

    addAllergy: async (allergy) => {
      const epochAtStart = storeEpoch

      try {
        await db.allergyIntolerances.put(allergy)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'AllergyIntolerance',
          resourceId: allergy.id,
          action: 'create',
          payload: allergy as unknown as Record<string, unknown>,
          hlcTimestamp: allergy._ultranos.hlcTimestamp,
        })

        // P9 — Audit fires before epoch check so the write is always recorded
        // even if PHI state was intentionally cleared (e.g. tab switch)
        const patientId = allergy.patient.reference.replace('Patient/', '')
        try {
          auditPhiAccess(
            AuditAction.CREATE,
            AuditResourceType.ALLERGY,
            allergy.id,
            patientId,
            { phiAccess: 'allergy_create' },
          )
        } catch {
          /* auditPhiAccess is documented non-throwing; defensive belt-and-suspenders */
        }

        if (storeEpoch !== epochAtStart) return

        set((state) => {
          if (allergy.clinicalStatus.coding[0]?.code === 'active') {
            state.allergies.push(allergy)
          }
        })
      } catch {
        throw new Error('Failed to save allergy')
      }
    },

    updateAllergyStatus: async (id, newStatus) => {
      const epochAtStart = storeEpoch

      // P11 — Fall back to DB lookup when the in-memory active list doesn't
      // contain the record (e.g. it is inactive/resolved and was filtered out)
      let existing = get().allergies.find((a) => a.id === id)
      if (!existing) {
        existing = await db.allergyIntolerances.get(id)
      }
      if (!existing) return

      const nowIso = new Date().toISOString()
      const hlcTimestamp = serializeHlc(hlc.now())

      // P8 — Use crypto.randomUUID() to produce a valid UUID for the new version
      // (the previous composite string was not a valid UUID per the schema)
      const updatedId = crypto.randomUUID()
      const updated: FhirAllergyIntolerance = {
        ...existing,
        id: updatedId,
        clinicalStatus: {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const,
              code: newStatus,
            },
          ],
        },
        _ultranos: {
          ...existing._ultranos,
          hlcTimestamp,
        },
        meta: {
          ...existing.meta,
          lastUpdated: nowIso,
        },
      }

      try {
        await db.allergyIntolerances.put(updated)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'AllergyIntolerance',
          resourceId: updated.id,
          action: 'update',
          payload: updated as unknown as Record<string, unknown>,
          hlcTimestamp,
        })

        const patientId = existing.patient.reference.replace('Patient/', '')
        try {
          auditPhiAccess(
            AuditAction.UPDATE,
            AuditResourceType.ALLERGY,
            id,
            patientId,
            { phiAccess: 'allergy_status_update', newStatus },
          )
        } catch {
          /* auditPhiAccess is documented non-throwing; defensive belt-and-suspenders */
        }

        // Epoch changed (clearPhiState called): DB write already committed, but in-memory list not updated — callers must not assume list consistency after concurrent clearPhiState
        if (storeEpoch !== epochAtStart) return

        set((state) => {
          if (newStatus !== 'active') {
            // Remove the old record from the active list
            state.allergies = state.allergies.filter((a) => a.id !== id)
          } else {
            // P10 — Re-activated allergy must be added back to the active list
            state.allergies.push(updated)
          }
        })
      } catch {
        throw new Error('Failed to update allergy status')
      }
    },

    clearPhiState: () => {
      storeEpoch++
      set((state) => {
        state.allergies = []
        state.isLoading = false
        state.loadError = null
      })
    },
  })),
)

// Register PHI cleanup on tab close / visibility change
if (typeof window !== 'undefined') {
  const cleanup = () => useAllergyStore.getState().clearPhiState()
  window.addEventListener('beforeunload', cleanup)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cleanup()
  })
}
