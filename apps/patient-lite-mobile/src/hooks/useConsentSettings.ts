import { useState, useEffect, useCallback, useRef } from 'react'
import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'
import { loadConsents, saveConsents } from '@/lib/offline-store'
import { emitAuditEvent } from '@/lib/audit'
import { createConsent, withdrawConsent, DATA_CATEGORIES } from '@/lib/consent-mapper'
import { queueConsentSync } from '@/lib/consent-sync'
import { HybridLogicalClock, serializeHlc } from '@ultranos/sync-engine'

export interface ConsentCategoryState {
  scope: ConsentScope
  label: string
  description: string
  enabled: boolean
  lastUpdated: string | null
}

export interface UseConsentSettingsResult {
  categories: ConsentCategoryState[]
  consentHistory: FhirConsent[]
  isLoading: boolean
  error: string | null
  toggleConsent: (scope: ConsentScope) => Promise<void>
}

const hlc = new HybridLogicalClock('patient-lite-mobile')

/**
 * Derive current toggle state from the consent history.
 * For each scope, the latest consent record determines active/withdrawn state.
 */
function deriveToggleStates(consents: FhirConsent[]): Map<ConsentScope, { enabled: boolean; lastUpdated: string }> {
  const states = new Map<ConsentScope, { enabled: boolean; lastUpdated: string }>()

  for (const consent of consents) {
    for (const scope of consent.category) {
      const existing = states.get(scope)
      // Consent dateTime may be an ISO instant (stored records) or an HLC string
      // (fresh toggles). HLC strings don't parse as Dates (NaN), so when either
      // value isn't Date-comparable, fall back to append-only order: this consent
      // comes later in the ledger, so it's the most recent action for the scope.
      const current = new Date(consent.dateTime).getTime()
      const prior = existing ? new Date(existing.lastUpdated).getTime() : NaN
      const currentIsNewer =
        !existing || Number.isNaN(current) || Number.isNaN(prior) || current > prior
      if (currentIsNewer) {
        states.set(scope, {
          enabled: consent.status === ConsentStatus.ACTIVE,
          lastUpdated: consent.dateTime,
        })
      }
    }
  }

  return states
}

/**
 * @param grantorRole - Who is making the consent change (defaults to SELF).
 *                      When a guardian manages consent, pass GrantorRole.GUARDIAN.
 * @param grantorUserId - The user ID of the person making the change.
 */
export function useConsentSettings(
  patientId: string | undefined,
  grantorRole: GrantorRole = GrantorRole.SELF,
  grantorUserId?: string,
): UseConsentSettingsResult {
  const [consents, setConsents] = useState<FhirConsent[]>([])
  // Mirrors the committed consents for synchronous reads inside async callbacks
  // (functional setState updaters don't run synchronously there).
  const consentsRef = useRef<FhirConsent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const opSeq = useRef(0)

  const load = useCallback(async () => {
    if (!patientId) {
      setConsents([])
      consentsRef.current = []
      setIsLoading(false)
      return
    }

    const seq = ++opSeq.current
    try {
      setIsLoading(true)
      setError(null)
      const stored = await loadConsents(patientId)
      if (seq !== opSeq.current) return

      emitAuditEvent({
        action: 'PHI_READ',
        resourceType: 'Consent',
        resourceId: 'consent-settings',
        patientId,
        outcome: 'success',
        metadata: { consentCount: String(stored.length) },
      })

      setConsents(stored)
      consentsRef.current = stored
    } catch {
      if (seq !== opSeq.current) return
      emitAuditEvent({
        action: 'PHI_READ',
        resourceType: 'Consent',
        resourceId: 'consent-settings',
        patientId,
        outcome: 'failure',
      })
      setError('Failed to load privacy settings')
    } finally {
      if (seq === opSeq.current) setIsLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleConsent = useCallback(async (scope: ConsentScope) => {
    if (!patientId) return

    const hlcTs = serializeHlc(hlc.now())

    // Read current consents from the ref: functional setState updaters don't run
    // synchronously inside an async callback, so reading `prev` there (and the
    // captured updatedConsents) was unreliable and left saveConsents with a stale
    // array. The ref always mirrors the latest committed consents.
    const prevConsents = consentsRef.current
    const isCurrentlyEnabled =
      deriveToggleStates(prevConsents).get(scope)?.enabled ?? false

    const newConsent: FhirConsent = isCurrentlyEnabled
      ? await withdrawConsent({
          patientId,
          scope,
          purpose: ConsentPurpose.TREATMENT,
          hlcTimestamp: hlcTs,
          grantorRole,
          grantorUserId,
        })
      : await createConsent({
          patientId,
          scope,
          purpose: ConsentPurpose.TREATMENT,
          hlcTimestamp: hlcTs,
          grantorRole,
          grantorUserId,
        })

    // Optimistic update (append-only consent ledger).
    const updatedConsents = [...prevConsents, newConsent]
    consentsRef.current = updatedConsents
    setConsents(updatedConsents)

    const consentRef = newConsent
    const isWithdrawal = consentRef.status === ConsentStatus.WITHDRAWN
    const auditAction = isWithdrawal ? 'PHI_DELETE' : 'PHI_WRITE'

    try {
      await saveConsents(patientId, updatedConsents)

      // Audit event emitted after persistence succeeds
      emitAuditEvent({
        action: auditAction,
        resourceType: 'Consent',
        resourceId: consentRef.id,
        patientId,
        outcome: 'success',
        metadata: {
          scope,
          action: isWithdrawal ? 'withdraw' : 'grant',
        },
      })

      // Queue for high-priority sync to Hub API (AC 3)
      queueConsentSync(consentRef)
    } catch {
      // Revert optimistic update on save failure
      consentsRef.current = consentsRef.current.filter((c) => c.id !== consentRef.id)
      setConsents((prev) => prev.filter((c) => c.id !== consentRef.id))

      emitAuditEvent({
        action: auditAction,
        resourceType: 'Consent',
        resourceId: consentRef.id,
        patientId,
        outcome: 'failure',
        metadata: {
          scope,
          action: isWithdrawal ? 'withdraw' : 'grant',
        },
      })

      setError('Failed to save privacy setting')
    }
  }, [patientId, grantorRole, grantorUserId])

  const toggleStates = deriveToggleStates(consents)

  const categories: ConsentCategoryState[] = DATA_CATEGORIES.map((cat) => {
    const state = toggleStates.get(cat.scope)
    return {
      scope: cat.scope,
      label: cat.label,
      description: cat.description,
      enabled: state?.enabled ?? false,
      lastUpdated: state?.lastUpdated ?? null,
    }
  })

  // Sort history newest-first
  const consentHistory = [...consents].sort(
    (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime(),
  )

  return {
    categories,
    consentHistory,
    isLoading,
    error,
    toggleConsent,
  }
}
