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
      if (!existing || new Date(consent.dateTime).getTime() > new Date(existing.lastUpdated).getTime()) {
        states.set(scope, {
          enabled: consent.status === ConsentStatus.ACTIVE,
          lastUpdated: consent.dateTime,
        })
      }
    }
  }

  return states
}

export function useConsentSettings(
  patientId: string | undefined,
): UseConsentSettingsResult {
  const [consents, setConsents] = useState<FhirConsent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const opSeq = useRef(0)

  const load = useCallback(async () => {
    if (!patientId) {
      setConsents([])
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

    // Derive current state before optimistic update
    // Use functional updater for setConsents to avoid stale closure on rapid toggles
    const currentToggleStates = deriveToggleStates(consents)
    const currentState = currentToggleStates.get(scope)
    const isCurrentlyEnabled = currentState?.enabled ?? false

    const newConsent = isCurrentlyEnabled
      ? await withdrawConsent({
          patientId,
          scope,
          purpose: ConsentPurpose.TREATMENT,
          hlcTimestamp: hlcTs,
          grantorRole: GrantorRole.SELF,
        })
      : await createConsent({
          patientId,
          scope,
          purpose: ConsentPurpose.TREATMENT,
          hlcTimestamp: hlcTs,
          grantorRole: GrantorRole.SELF,
        })

    // Optimistic update using functional form to avoid stale closure
    let updatedConsents: FhirConsent[] = []
    setConsents((prev) => {
      updatedConsents = [...prev, newConsent]
      return updatedConsents
    })

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
  }, [patientId])

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
