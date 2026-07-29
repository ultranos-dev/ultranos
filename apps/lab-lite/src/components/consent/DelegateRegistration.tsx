'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addFamilyDelegate,
  getConsentsByPatient,
  type ConsentRecord,
  type DelegateRelationship,
} from '@/lib/db'
import { reportDelegateAuditEvent } from '@/lib/audit-client'
import { encryptText } from '@/lib/delegate-crypto'
import { validateDelegatePhone } from '@/lib/delegate-phone-validation'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export interface DelegateRegistrationProps {
  patientRef: string
  onRegistered: (delegateId: number) => void
  onCancel: () => void
}

const RELATIONSHIP_OPTIONS: DelegateRelationship[] = [
  'spouse', 'parent', 'child', 'sibling', 'grandchild', 'in-law', 'other',
]

/** Map DelegateRelationship value to i18n key under delegates.relationship */
const RELATIONSHIP_I18N_KEY: Record<DelegateRelationship, string> = {
  'spouse':    'spouse',
  'parent':    'parent',
  'child':     'child',
  'sibling':   'sibling',
  'grandchild':'grandchild',
  'in-law':    'inLaw',
  'other':     'other',
}

export function DelegateRegistration({
  patientRef,
  onRegistered,
  onCancel,
}: DelegateRegistrationProps) {
  const t = useTranslations('delegates')
  const session = useAuthSessionStore((s) => s.session)

  const [activeConsent, setActiveConsent] = useState<ConsentRecord | null>(null)
  const [loadingConsent, setLoadingConsent] = useState(true)
  const [phone, setPhone] = useState('')
  const [relationship, setRelationship] = useState<DelegateRelationship | ''>('')
  const [delegateName, setDelegateName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{
    phone?: string
    relationship?: string
    consent?: string
    general?: string
  }>({})

  // Load the active consent record for this patient
  useEffect(() => {
    let cancelled = false
    setLoadingConsent(true)
    getConsentsByPatient(patientRef).then((records) => {
      if (cancelled) return
      const active = records.find((r) => r.status === 'active') ?? null
      setActiveConsent(active)
      setLoadingConsent(false)
    })
    return () => { cancelled = true }
  }, [patientRef])

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {}

    if (!activeConsent) {
      newErrors.consent = t('validation.consentMissing')
    }

    const phoneError = validateDelegatePhone(phone)
    if (phoneError) {
      newErrors.phone = t(`validation.${phoneError}`)
    }

    if (!relationship) {
      newErrors.relationship = t('validation.relationshipRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [activeConsent, phone, relationship, t])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    if (!activeConsent?.id) return

    setSubmitting(true)
    setErrors({})

    try {
      // Encrypt PII before Dexie storage (CLAUDE.md — PHI encryption)
      const encryptedPhone = await encryptText(phone)
      const encryptedName = delegateName.trim()
        ? await encryptText(delegateName.trim())
        : undefined

      const delegateId = await addFamilyDelegate({
        patientRef,
        delegatePhone: encryptedPhone,
        delegateRelationship: relationship as DelegateRelationship,
        ...(encryptedName ? { delegateName: encryptedName } : {}),
        consentRecordId: activeConsent.id,
        status: 'active',
        registeredAt: new Date().toISOString(),
        registeredByTechId: session?.userId ?? 'unknown',
        hlcTimestamp: serializeHlc(hlc.now()),
        syncStatus: 'pending',
      })

      reportDelegateAuditEvent({
        action: 'DELEGATE_REGISTERED',
        delegateId,
        patientRef,
        delegateRelationship: relationship as string,
        consentRecordId: activeConsent.id,
        technicianId: session?.userId,
      })

      onRegistered(delegateId)
    } catch {
      setErrors({ general: t('registerError') })
    } finally {
      setSubmitting(false)
    }
  }, [validate, activeConsent, phone, delegateName, relationship, patientRef, session, t, onRegistered])

  if (loadingConsent) {
    return (
      <div className="flex items-center justify-center p-6" aria-busy="true">
        <span className="text-sm text-muted-foreground">{t('registering')}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm dark:border-border dark:bg-card">
      <h2 className="mb-4 text-lg font-semibold text-foreground dark:text-foreground">
        {t('registerTitle')}
      </h2>

      {/* Consent linkage display */}
      {activeConsent ? (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
          {t('consentLinked', {
            method: activeConsent.method,
            date: new Date(activeConsent.capturedAt).toLocaleDateString(),
          })}
        </div>
      ) : (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {t('consentRequired')}
        </div>
      )}

      {/* Phone number */}
      <div className="mb-4">
        <label htmlFor="delegate-phone" className="block text-sm font-medium text-foreground dark:text-muted-foreground">
          {t('phone')}
        </label>
        <input
          id="delegate-phone"
          type="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('phonePlaceholder')}
          disabled={!activeConsent || submitting}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 dark:border-border dark:bg-muted"
        />
        {errors.phone && (
          <p id="phone-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.phone}
          </p>
        )}
      </div>

      {/* Relationship */}
      <div className="mb-4">
        <label htmlFor="delegate-relationship" className="block text-sm font-medium text-foreground dark:text-muted-foreground">
          {t('relationship')}
        </label>
        <select
          id="delegate-relationship"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value as DelegateRelationship)}
          disabled={!activeConsent || submitting}
          aria-describedby={errors.relationship ? 'relationship-error' : undefined}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 dark:border-border dark:bg-muted"
        >
          <option value="" disabled>—</option>
          {RELATIONSHIP_OPTIONS.map((rel) => (
            <option key={rel} value={rel}>
              {t(`relationship.${RELATIONSHIP_I18N_KEY[rel]}`)}
            </option>
          ))}
        </select>
        {errors.relationship && (
          <p id="relationship-error" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.relationship}
          </p>
        )}
      </div>

      {/* Optional delegate name */}
      <div className="mb-6">
        <label htmlFor="delegate-name" className="block text-sm font-medium text-foreground dark:text-muted-foreground">
          {t('name')}
        </label>
        <input
          id="delegate-name"
          type="text"
          value={delegateName}
          onChange={(e) => setDelegateName(e.target.value)}
          placeholder={t('namePlaceholder')}
          disabled={!activeConsent || submitting}
          className="mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 dark:border-border dark:bg-muted"
        />
      </div>

      {errors.consent && (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">{errors.consent}</p>
      )}
      {errors.general && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{errors.general}</p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted/30 disabled:opacity-50 dark:border-border dark:hover:bg-muted"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!activeConsent || submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? t('registering') : t('register')}
        </button>
      </div>
    </div>
  )
}
