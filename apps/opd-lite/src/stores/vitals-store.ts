import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { hlc, serializeHlc } from '@/lib/hlc'
import { db } from '@/lib/db'
import { calculateBMI } from '@ultranos/shared-types'
import { getVitalRangeStatus, type VitalKey } from '@/lib/vitals-config'
import { mapVitalsToObservations, LOINC } from '@/lib/vitals-fhir-mapper'
import type { RangeStatus } from '@/components/clinical/vitals-form'

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface VitalsState {
  weight: string
  height: string
  systolic: string
  diastolic: string
  temperature: string
  encounterId: string | null
  patientId: string | null
  autosaveStatus: AutosaveStatus
  _pendingSave: boolean

  setWeight: (value: string) => void
  setHeight: (value: string) => void
  setSystolic: (value: string) => void
  setDiastolic: (value: string) => void
  setTemperature: (value: string) => void
  initForEncounter: (encounterId: string, patientId: string) => void
  persistObservations: () => Promise<void>
  loadFromObservations: (encounterId: string) => Promise<void>
  clearPhiState: () => void

  // Derived
  getBmi: () => number | null
  getRangeStatuses: () => Partial<Record<string, RangeStatus>>
}

export const useVitalsStore = create<VitalsState>()(
  immer((set, get) => ({
    weight: '',
    height: '',
    systolic: '',
    diastolic: '',
    temperature: '',
    encounterId: null,
    patientId: null,
    autosaveStatus: 'idle' as AutosaveStatus,
    _pendingSave: false,

    setWeight: (value: string) => {
      set((state) => { state.weight = value })
    },
    setHeight: (value: string) => {
      set((state) => { state.height = value })
    },
    setSystolic: (value: string) => {
      set((state) => { state.systolic = value })
    },
    setDiastolic: (value: string) => {
      set((state) => { state.diastolic = value })
    },
    setTemperature: (value: string) => {
      set((state) => { state.temperature = value })
    },

    initForEncounter: (encounterId: string, patientId: string) => {
      set((state) => {
        state.encounterId = encounterId
        state.patientId = patientId
        state.weight = ''
        state.height = ''
        state.systolic = ''
        state.diastolic = ''
        state.temperature = ''
        state.autosaveStatus = 'idle'
        state._pendingSave = false
      })
    },

    persistObservations: async () => {
      const { encounterId, patientId, weight, height, systolic, diastolic, temperature, autosaveStatus } = get()
      if (!encounterId || !patientId) return

      // Re-queue: if already saving, flag for retry after current save completes
      if (autosaveStatus === 'saving') {
        set((state) => { state._pendingSave = true })
        return
      }

      // Only save if at least one vital has data
      const hasData = [weight, height, systolic, diastolic, temperature].some(
        (v) => v !== '' && Number.isFinite(parseFloat(v)),
      )
      if (!hasData) return

      set((state) => { state.autosaveStatus = 'saving'; state._pendingSave = false })

      try {
        const ts = hlc.now()
        const nowIso = new Date().toISOString()
        const bmi = get().getBmi()

        const observations = mapVitalsToObservations(
          { weight, height, systolic, diastolic, temperature, bmi },
          {
            patientId,
            encounterId,
            hlcTimestamp: serializeHlc(ts),
            nowIso,
          },
        )

        // TODO: [D9/D23] Emit audit event for PHI write when local audit infrastructure lands

        // Append-only: add new observations without deleting old ones (Tier 2 addenda).
        // Old versions are preserved for sync conflict resolution.
        await db.transaction('rw', db.observations, async () => {
          await db.observations.bulkAdd(observations)
        })

        const savedEncounterId = encounterId
        set((state) => {
          // Guard against encounter switch during async save
          if (state.encounterId === savedEncounterId) {
            state.autosaveStatus = 'saved'
          }
        })

        // Re-queue: if a save was requested while we were saving, run it now
        if (get()._pendingSave) {
          set((state) => { state._pendingSave = false })
          get().persistObservations()
        }
      } catch {
        set((state) => { state.autosaveStatus = 'error' })
      }
    },

    loadFromObservations: async (encounterId: string) => {
      // TODO: [D9/D23] Emit audit event for PHI read when local audit infrastructure lands

      const observations = await db.observations
        .where('encounter.reference')
        .equals(`Encounter/${encounterId}`)
        .toArray()

      if (observations.length === 0) return
      if (get().encounterId !== encounterId) return

      // Append-only: pick the latest observation per LOINC code by HLC timestamp
      const latestByCode = new Map<string, typeof observations[0]>()
      for (const obs of observations) {
        const loincCode = obs.code.coding?.[0]?.code
        if (!loincCode) continue
        const existing = latestByCode.get(loincCode)
        if (!existing || obs._ultranos.hlcTimestamp > existing._ultranos.hlcTimestamp) {
          latestByCode.set(loincCode, obs)
        }
      }

      set((state) => {
        for (const [loincCode, obs] of latestByCode) {
          if (loincCode === LOINC.BODY_WEIGHT && obs.valueQuantity) {
            state.weight = String(obs.valueQuantity.value)
          } else if (loincCode === LOINC.BODY_HEIGHT && obs.valueQuantity) {
            state.height = String(obs.valueQuantity.value)
          } else if (loincCode === LOINC.BODY_TEMPERATURE && obs.valueQuantity) {
            state.temperature = String(obs.valueQuantity.value)
          } else if (loincCode === LOINC.BLOOD_PRESSURE && obs.component) {
            for (const comp of obs.component) {
              const compCode = comp.code.coding?.[0]?.code
              if (compCode === LOINC.SYSTOLIC_BP && comp.valueQuantity) {
                state.systolic = String(comp.valueQuantity.value)
              } else if (compCode === LOINC.DIASTOLIC_BP && comp.valueQuantity) {
                state.diastolic = String(comp.valueQuantity.value)
              }
            }
          }
          // BMI is derived, don't load it
        }
        state.autosaveStatus = 'idle'
      })
    },

    clearPhiState: () => {
      set((state) => {
        state.weight = ''
        state.height = ''
        state.systolic = ''
        state.diastolic = ''
        state.temperature = ''
        state.encounterId = null
        state.patientId = null
        state.autosaveStatus = 'idle'
        state._pendingSave = false
      })
    },

    getBmi: () => {
      const { weight, height } = get()
      const w = parseFloat(weight)
      const h = parseFloat(height)
      return calculateBMI(w, h)
    },

    getRangeStatuses: () => {
      const { weight, height, systolic, diastolic, temperature } = get()
      const statuses: Partial<Record<string, RangeStatus>> = {}

      const fields: [VitalKey, string][] = [
        ['weight', weight],
        ['height', height],
        ['systolic', systolic],
        ['diastolic', diastolic],
        ['temperature', temperature],
      ]

      for (const [key, raw] of fields) {
        const val = parseFloat(raw)
        if (raw !== '' && Number.isFinite(val)) {
          const status = getVitalRangeStatus(key, val)
          if (status !== 'normal') {
            statuses[key] = status
          }
        }
      }

      const bmi = get().getBmi()
      if (bmi !== null) {
        const bmiStatus = getVitalRangeStatus('bmi', bmi)
        if (bmiStatus !== 'normal') {
          statuses.bmi = bmiStatus
        }
      }

      return statuses
    },
  })),
)

// PHI cleanup on tab close / background (mobile browsers may not fire beforeunload)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useVitalsStore.getState().clearPhiState()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      useVitalsStore.getState().clearPhiState()
    }
  })
}
