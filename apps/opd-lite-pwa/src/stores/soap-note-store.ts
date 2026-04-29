import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { hlc, serializeHlc } from '@/lib/hlc'
import { db } from '@/lib/db'
import { z } from 'zod'

const SOAP_FIELD_MAX_LENGTH = 10_000

const SoapLedgerPayloadSchema = z.object({
  encounterId: z.string().uuid(),
  subjective: z.string().max(SOAP_FIELD_MAX_LENGTH),
  objective: z.string().max(SOAP_FIELD_MAX_LENGTH),
})

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SoapNoteState {
  subjective: string
  objective: string
  encounterId: string | null
  autosaveStatus: AutosaveStatus
  lastSavedAt: string | null

  setSubjective: (text: string) => void
  setObjective: (text: string) => void
  initForEncounter: (encounterId: string) => void
  persistToLedger: () => Promise<void>
  loadFromLedger: (encounterId: string) => Promise<void>
  clearPhiState: () => void
}

export const useSoapNoteStore = create<SoapNoteState>()(
  immer((set, get) => ({
    subjective: '',
    objective: '',
    encounterId: null,
    autosaveStatus: 'idle' as AutosaveStatus,
    lastSavedAt: null,

    setSubjective: (text: string) => {
      set((state) => {
        state.subjective = text
      })
    },

    setObjective: (text: string) => {
      set((state) => {
        state.objective = text
      })
    },

    initForEncounter: (encounterId: string) => {
      set((state) => {
        state.encounterId = encounterId
        state.subjective = ''
        state.objective = ''
        state.autosaveStatus = 'idle'
        state.lastSavedAt = null
      })
    },

    persistToLedger: async () => {
      const { encounterId, subjective, objective, autosaveStatus } = get()
      if (!encounterId) return
      if (autosaveStatus === 'saving') return // in-flight guard

      const payload = SoapLedgerPayloadSchema.safeParse({
        encounterId,
        subjective,
        objective,
      })
      if (!payload.success) return

      set((state) => {
        state.autosaveStatus = 'saving'
      })

      try {
        const ts = hlc.now()
        const nowIso = new Date().toISOString()

        await db.soapLedger.add({
          id: crypto.randomUUID(),
          encounterId,
          subjective,
          objective,
          hlcTimestamp: serializeHlc(ts),
          createdAt: nowIso,
        })

        set((state) => {
          state.autosaveStatus = 'saved'
          state.lastSavedAt = nowIso
        })
      } catch {
        set((state) => {
          state.autosaveStatus = 'error'
        })
      }
    },

    loadFromLedger: async (encounterId: string) => {
      const entries = await db.soapLedger
        .where('encounterId')
        .equals(encounterId)
        .sortBy('hlcTimestamp')

      const latest = entries[entries.length - 1]
      if (!latest) return

      // Guard: if encounter changed while loading, discard stale result
      if (get().encounterId !== encounterId) return

      set((state) => {
        state.subjective = latest.subjective
        state.objective = latest.objective
        state.autosaveStatus = 'idle'
      })
    },

    clearPhiState: () => {
      set((state) => {
        state.subjective = ''
        state.objective = ''
        state.encounterId = null
        state.autosaveStatus = 'idle'
        state.lastSavedAt = null
      })
    },
  })),
)

// PHI cleanup on tab close (CLAUDE.md: "Tab close → encrypted cache cleared")
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useSoapNoteStore.getState().clearPhiState()
  })
}
