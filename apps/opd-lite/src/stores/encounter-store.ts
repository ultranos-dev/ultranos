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

/** The practitioner reference on an encounter (participant[0].individual.reference). */
function encounterPractitionerRef(e: FhirEncounterZod): string | undefined {
  return e.participant?.[0]?.individual?.reference
}

interface EncounterState {
  activeEncounter: FhirEncounterZod | null
  isStarting: boolean
  medicationHistoryAvailable: boolean
  activeMedicationStatements: FhirMedicationStatementZod[]

  startEncounter: (patientId: string, practitionerRef: string) => Promise<void>
  endEncounter: () => Promise<void>
  loadActiveEncounter: (patientId: string, practitionerRef?: string) => Promise<void>
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
      // P2: Guard against concurrent/duplicate encounters (in-memory, patient-scoped).
      const existing = get().activeEncounter
      if (
        existing &&
        existing.status === 'in-progress' &&
        existing.subject.reference === `Patient/${patientId}`
      ) {
        return
      }

      set((state) => {
        state.isStarting = true
      })

      try {
        // Authoritative local guard against the duplicate-open-encounter bug:
        // before creating, adopt any existing in-progress encounter for THIS
        // (patient, practitioner) from the local cache. This survives the
        // in-memory guard being lost across sessions/tab-refocus/devices — the
        // exact gap that produced two open encounters. Dexie is hydrated on login
        // by pullPractitionerEncounters and per-chart by pullPatientChanges, and
        // the Hub + a partial unique index enforce the same invariant server-side.
        // NOTE: participant is an ENCRYPTED (non-indexed) field, so it is NOT
        // readable inside Dexie's .filter() predicate (which runs before the
        // decryption middleware). Filter on the indexed/plaintext `status`, then
        // materialize (.toArray() decrypts) and match the practitioner in JS.
        const openForPatient = await db.encounters
          .where('subject.reference')
          .equals(`Patient/${patientId}`)
          .filter((e) => e.status === 'in-progress')
          .toArray()
        const localOpen = openForPatient.find(
          (e) => encounterPractitionerRef(e) === practitionerRef,
        )

        if (localOpen) {
          set((state) => {
            state.activeEncounter = localOpen
            state.isStarting = false
          })
          auditPhiAccess(AuditAction.READ, AuditResourceType.ENCOUNTER, localOpen.id, patientId, {
            phiAccess: 'encounter_resume',
          })
          return
        }

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

    loadActiveEncounter: async (patientId: string, practitionerRef?: string) => {
      // P5: Skip load if a start is in progress to avoid race condition
      if (get().isStarting) return

      // Scope to THIS practitioner when provided: under the one-open-encounter-per-
      // (patient, practitioner) model, an open encounter belonging to a different
      // doctor must not surface as this clinician's active consultation.
      // participant is encrypted, so materialize (decrypt) before matching it —
      // it is not readable inside .filter() (see startEncounter for detail).
      const openForPatient = await db.encounters
        .where('subject.reference')
        .equals(`Patient/${patientId}`)
        .filter((e) => e.status === 'in-progress')
        .toArray()
      const active = practitionerRef
        ? (openForPatient.find((e) => encounterPractitionerRef(e) === practitionerRef) ?? null)
        : (openForPatient[0] ?? null)

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
