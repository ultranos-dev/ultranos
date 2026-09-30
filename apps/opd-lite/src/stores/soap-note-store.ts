import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { hlc, serializeHlc } from '@/lib/hlc'
import { db } from '@/lib/db'
import { z } from 'zod'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'

const SOAP_FIELD_MAX_LENGTH = 10_000

// Server-side decryption fail-safe sentinel (see @ultranos/crypto `decryptField`).
// When a stored SOAP field can't be decrypted, the Hub returns this literal string.
// It must NEVER be loaded into an editable field or saved back — doing so would
// display a non-note as clinical content and could overwrite the (still-intact,
// append-only) original ciphertext on the next autosave.
const DECRYPT_PLACEHOLDER = '[Encrypted Content]'

const SoapLedgerPayloadSchema = z.object({
  encounterId: z.string().uuid(),
  subjective: z.string().max(SOAP_FIELD_MAX_LENGTH),
  objective: z.string().max(SOAP_FIELD_MAX_LENGTH),
  assessment: z.string().max(SOAP_FIELD_MAX_LENGTH),
  plan: z.string().max(SOAP_FIELD_MAX_LENGTH),
})

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** AI scribe diff state for side-by-side review */
export interface AIScribeDiffState {
  /** Whether the AI diff view is currently shown */
  isActive: boolean
  /** Loading state while AI is parsing */
  isLoading: boolean
  /** Original freeform text sent to AI */
  originalText: string
  /** Immutable snapshot of original AI output (never mutated after setAIDiffResult) */
  originalAiSubjective: string
  originalAiObjective: string
  originalAiAssessment: string
  originalAiPlan: string
  /** AI-parsed sections (editable by clinician in diff view) */
  aiSubjective: string
  aiObjective: string
  aiAssessment: string
  aiPlan: string
  /** Model version for audit */
  aiModelVersion: string
  /** Error from AI, if any */
  error: string | null
}

interface SoapNoteState {
  subjective: string
  objective: string
  assessment: string
  plan: string
  encounterId: string | null
  autosaveStatus: AutosaveStatus
  lastSavedAt: string | null

  /**
   * True when the loaded note contained the decryption fail-safe placeholder.
   * The original ciphertext is intact on the Hub (append-only); the UI must show a
   * recovery notice and autosave is blocked so the placeholder can't be persisted.
   */
  decryptFailed: boolean

  /** AI scribe diff state */
  aiDiff: AIScribeDiffState

  setSubjective: (text: string) => void
  setObjective: (text: string) => void
  setAssessment: (text: string) => void
  setPlan: (text: string) => void
  initForEncounter: (encounterId: string) => void
  persistToLedger: () => Promise<void>
  loadFromLedger: (encounterId: string) => Promise<void>
  clearPhiState: () => void

  /** AI scribe actions */
  setAIDiffLoading: (loading: boolean) => void
  setAIDiffResult: (result: {
    originalText: string
    subjective: string
    objective: string
    assessment: string
    plan: string
    modelVersion: string
  }) => void
  setAIDiffError: (error: string) => void
  updateAIDiffField: (field: 'aiSubjective' | 'aiObjective' | 'aiAssessment' | 'aiPlan', value: string) => void
  confirmAIDiff: () => void
  discardAIDiff: () => void
}

const initialAIDiff: AIScribeDiffState = {
  isActive: false,
  isLoading: false,
  originalText: '',
  originalAiSubjective: '',
  originalAiObjective: '',
  originalAiAssessment: '',
  originalAiPlan: '',
  aiSubjective: '',
  aiObjective: '',
  aiAssessment: '',
  aiPlan: '',
  aiModelVersion: '',
  error: null,
}

export const useSoapNoteStore = create<SoapNoteState>()(
  immer((set, get) => ({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    encounterId: null,
    autosaveStatus: 'idle' as AutosaveStatus,
    lastSavedAt: null,
    decryptFailed: false,
    aiDiff: { ...initialAIDiff },

    // Editing clears the decrypt-failed flag: the clinician is now authoring fresh
    // content, which is safe to persist as a new append-only ledger entry (the
    // original ciphertext is untouched).
    setSubjective: (text: string) => {
      set((state) => {
        state.subjective = text
        state.decryptFailed = false
      })
    },

    setObjective: (text: string) => {
      set((state) => {
        state.objective = text
        state.decryptFailed = false
      })
    },

    setAssessment: (text: string) => {
      set((state) => {
        state.assessment = text
        state.decryptFailed = false
      })
    },

    setPlan: (text: string) => {
      set((state) => {
        state.plan = text
        state.decryptFailed = false
      })
    },

    initForEncounter: (encounterId: string) => {
      set((state) => {
        state.encounterId = encounterId
        state.subjective = ''
        state.objective = ''
        state.assessment = ''
        state.plan = ''
        state.autosaveStatus = 'idle'
        state.lastSavedAt = null
        state.decryptFailed = false
        state.aiDiff = { ...initialAIDiff }
      })
    },

    persistToLedger: async () => {
      const { encounterId, subjective, objective, assessment, plan, autosaveStatus, decryptFailed } = get()
      if (!encounterId) return
      if (autosaveStatus === 'saving') return // in-flight guard
      // Never write back an undecryptable note: this would append the placeholder/
      // blanked fields over the intact original (append-only) ciphertext. Editing a
      // field clears this flag, so genuine new content still saves normally.
      if (decryptFailed) return

      const payload = SoapLedgerPayloadSchema.safeParse({
        encounterId,
        subjective,
        objective,
        assessment,
        plan,
      })
      if (!payload.success) return

      set((state) => {
        state.autosaveStatus = 'saving'
      })

      try {
        const ts = hlc.now()
        const nowIso = new Date().toISOString()

        const practitionerRef = `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}`

        const ledgerEntry = {
          id: crypto.randomUUID(),
          encounterId,
          subjective,
          objective,
          assessment,
          plan,
          assessorRef: practitionerRef,
          hlcTimestamp: serializeHlc(ts),
          createdAt: nowIso,
        }

        await db.soapLedger.add(ledgerEntry)

        void enqueueSyncAction(syncQueue, {
          resourceType: 'ClinicalImpression',
          resourceId: encounterId,
          action: 'update',
          payload: ledgerEntry as unknown as Record<string, unknown>,
          hlcTimestamp: ledgerEntry.hlcTimestamp,
        })

        auditPhiAccess(AuditAction.UPDATE, AuditResourceType.CLINICAL_NOTE, encounterId, undefined, {
          phiAccess: 'soap_note_edit',
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

      auditPhiAccess(AuditAction.READ, AuditResourceType.CLINICAL_NOTE, encounterId, undefined, {
        phiAccess: 'soap_note_view',
      })

      // A field that decrypted to the fail-safe placeholder is NOT clinical content:
      // blank it (so it never appears as an editable note) and flag the failure so
      // the UI shows a recovery notice and autosave is blocked.
      const isPlaceholder = (v?: string) => v === DECRYPT_PLACEHOLDER
      const anyFailed =
        isPlaceholder(latest.subjective) ||
        isPlaceholder(latest.objective) ||
        isPlaceholder(latest.assessment) ||
        isPlaceholder(latest.plan)
      const sanitize = (v?: string) => (isPlaceholder(v) ? '' : (v ?? ''))

      set((state) => {
        state.subjective = sanitize(latest.subjective)
        state.objective = sanitize(latest.objective)
        state.assessment = sanitize(latest.assessment)
        state.plan = sanitize(latest.plan)
        state.decryptFailed = anyFailed
        state.autosaveStatus = 'idle'
      })
    },

    clearPhiState: () => {
      set((state) => {
        state.subjective = ''
        state.objective = ''
        state.assessment = ''
        state.plan = ''
        state.encounterId = null
        state.autosaveStatus = 'idle'
        state.lastSavedAt = null
        state.decryptFailed = false
        state.aiDiff = { ...initialAIDiff }
      })
    },

    // AI scribe actions

    setAIDiffLoading: (loading: boolean) => {
      set((state) => {
        state.aiDiff.isLoading = loading
        state.aiDiff.isActive = true
        state.aiDiff.error = null
      })
    },

    setAIDiffResult: (result) => {
      set((state) => {
        state.aiDiff.isActive = true
        state.aiDiff.isLoading = false
        state.aiDiff.originalText = result.originalText
        // Immutable snapshot of original AI output — never mutated
        state.aiDiff.originalAiSubjective = result.subjective
        state.aiDiff.originalAiObjective = result.objective
        state.aiDiff.originalAiAssessment = result.assessment
        state.aiDiff.originalAiPlan = result.plan
        // Editable copies for physician review
        state.aiDiff.aiSubjective = result.subjective
        state.aiDiff.aiObjective = result.objective
        state.aiDiff.aiAssessment = result.assessment
        state.aiDiff.aiPlan = result.plan
        state.aiDiff.aiModelVersion = result.modelVersion
        state.aiDiff.error = null
      })
    },

    setAIDiffError: (error: string) => {
      set((state) => {
        state.aiDiff.isLoading = false
        state.aiDiff.error = error
      })
    },

    updateAIDiffField: (field, value) => {
      set((state) => {
        state.aiDiff[field] = value
      })
    },

    confirmAIDiff: () => {
      const { aiDiff } = get()
      set((state) => {
        // Apply confirmed AI content to the SOAP fields
        state.subjective = aiDiff.aiSubjective
        state.objective = aiDiff.aiObjective
        state.assessment = aiDiff.aiAssessment
        state.plan = aiDiff.aiPlan
        // Clear diff state
        state.aiDiff = { ...initialAIDiff }
      })
    },

    discardAIDiff: () => {
      set((state) => {
        state.aiDiff = { ...initialAIDiff }
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
