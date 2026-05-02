import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FhirEncounterZod, FhirMedicationStatementZod } from '@ultranos/shared-types'
import { HybridLogicalClock, serializeHlc } from '@ultranos/sync-engine'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'

const NODE_ID_KEY = 'ultranos_node_id'

function getOrCreateNodeId(): string {
  let nodeId = globalThis.sessionStorage?.getItem(NODE_ID_KEY)
  if (!nodeId) {
    nodeId = crypto.randomUUID()
    globalThis.sessionStorage?.setItem(NODE_ID_KEY, nodeId)
  }
  return nodeId
}

const hlc = new HybridLogicalClock(getOrCreateNodeId())

interface EncounterState {
  activeEncounter: FhirEncounterZod | null
  isStarting: boolean
  medicationHistoryAvailable: boolean
  activeMedicationStatements: FhirMedicationStatementZod[]

  startEncounter: (patientId: string, practitionerRef: string) => Promise<void>
  endEncounter: () => Promise<void>
  loadActiveEncounter: (patientId: string) => Promise<void>
  loadMedicationHistory: (patientId: string) => Promise<void>
  clearPhiState: () => void
}

export const useEncounterStore = create<EncounterState>()(
  immer((set, get) => ({
    activeEncounter: null,
    isStarting: false,
    medicationHistoryAvailable: false,
    activeMedicationStatements: [],

    startEncounter: async (patientId: string, practitionerRef: string) => {
      // P2: Guard against concurrent/duplicate encounters
      const existing = get().activeEncounter
      if (existing && existing.status === 'in-progress') return

      set((state) => {
        state.isStarting = true
      })

      try {
        const ts = hlc.now()
        const hlcString = serializeHlc(ts)
        const nowIso = new Date().toISOString()

        const encounter: FhirEncounterZod = {
          id: crypto.randomUUID(),
          resourceType: 'Encounter',
          status: 'in-progress',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: {
            reference: `Patient/${patientId}`,
          },
          participant: [
            {
              individual: {
                reference: practitionerRef,
              },
            },
          ],
          period: {
            start: nowIso,
          },
          _ultranos: {
            isOfflineCreated: true,
            hlcTimestamp: hlcString,
            createdAt: nowIso,
          },
          meta: {
            lastUpdated: nowIso,
            versionId: '1',
          },
        }

        // Optimistic: set state immediately, then persist to Dexie
        set((state) => {
          state.activeEncounter = encounter
          state.isStarting = false
        })

        await db.encounters.put(encounter)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'Encounter',
          resourceId: encounter.id,
          action: 'create',
          payload: encounter as unknown as Record<string, unknown>,
          hlcTimestamp: hlcString,
        })

        auditPhiAccess(AuditAction.CREATE, AuditResourceType.ENCOUNTER, encounter.id, patientId, {
          phiAccess: 'encounter_start',
        })
      } catch {
        // P1: Rollback optimistic state on Dexie/HLC failure
        set((state) => {
          state.activeEncounter = null
          state.isStarting = false
        })
      }
    },

    endEncounter: async () => {
      const current = get().activeEncounter
      if (!current) return

      try {
        const nowIso = new Date().toISOString()
        const ts = hlc.now()
        const hlcString = serializeHlc(ts)

        const currentVersion = parseInt(current.meta.versionId ?? '0', 10)

        const updated: FhirEncounterZod = {
          ...current,
          status: 'finished',
          period: {
            ...current.period,
            end: nowIso,
          },
          _ultranos: {
            ...current._ultranos,
            hlcTimestamp: hlcString,
          },
          meta: {
            ...current.meta,
            lastUpdated: nowIso,
            versionId: String(currentVersion + 1),
          },
        }

        await db.encounters.put(updated)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'Encounter',
          resourceId: updated.id,
          action: 'update',
          payload: updated as unknown as Record<string, unknown>,
          hlcTimestamp: hlcString,
        })

        const patientRef = current.subject.reference.replace('Patient/', '')
        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.ENCOUNTER, current.id, patientRef, {
          phiAccess: 'encounter_end',
        })

        // P4: Clear activeEncounter after successful persist
        set((state) => {
          state.activeEncounter = null
        })
      } catch {
        // P1: Leave state unchanged on failure — encounter remains in-progress
      }
    },

    loadActiveEncounter: async (patientId: string) => {
      // P5: Skip load if a start is in progress to avoid race condition
      if (get().isStarting) return

      const active = await db.encounters
        .where('subject.reference')
        .equals(`Patient/${patientId}`)
        .filter((e) => e.status === 'in-progress')
        .first()

      // P5: Re-check after async — don't overwrite a freshly started encounter for this patient
      const current = get().activeEncounter
      if (get().isStarting) return
      if (current?.status === 'in-progress' && current.subject.reference === `Patient/${patientId}`) return

      // P7: Clear stale state when no active encounter found
      set((state) => {
        state.activeEncounter = active ?? null
      })

      if (active) {
        auditPhiAccess(AuditAction.READ, AuditResourceType.ENCOUNTER, active.id, patientId, {
          phiAccess: 'encounter_load',
        })
      }
    },

    /**
     * Story 10.1 AC 8, 9: Load active MedicationStatements from Dexie cache.
     * On encounter start, the Hub API is fetched and cached in Dexie.
     * If no cached data exists, set medicationHistoryAvailable to false
     * so the interaction checker shows the "history unavailable" warning.
     */
    loadMedicationHistory: async (patientId: string) => {
      try {
        const cached = await db.medicationStatements
          .where('subject.reference')
          .equals(`Patient/${patientId}`)
          .filter((ms) => ms.status === 'active')
          .toArray()

        set((state) => {
          state.activeMedicationStatements = cached
          state.medicationHistoryAvailable = true
        })
      } catch {
        // Offline or Dexie failure — check if we have any cached data at all
        try {
          const anyCached = await db.medicationStatements
            .where('subject.reference')
            .equals(`Patient/${patientId}`)
            .count()

          if (anyCached > 0) {
            const cached = await db.medicationStatements
              .where('subject.reference')
              .equals(`Patient/${patientId}`)
              .filter((ms) => ms.status === 'active')
              .toArray()

            set((state) => {
              state.activeMedicationStatements = cached
              state.medicationHistoryAvailable = true
            })
          } else {
            set((state) => {
              state.activeMedicationStatements = []
              state.medicationHistoryAvailable = false
            })
          }
        } catch {
          set((state) => {
            state.activeMedicationStatements = []
            state.medicationHistoryAvailable = false
          })
        }
      }
    },

    clearPhiState: () => {
      set((state) => {
        state.activeEncounter = null
        state.isStarting = false
        state.medicationHistoryAvailable = false
        state.activeMedicationStatements = []
      })
    },
  })),
)

// PHI cleanup: clear sensitive state on tab close (Key-in-Memory enforcement)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useEncounterStore.getState().clearPhiState()
  })

  // P3: Actually clear PHI on visibilitychange for mobile browsers
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      useEncounterStore.getState().clearPhiState()
    }
  })
}
