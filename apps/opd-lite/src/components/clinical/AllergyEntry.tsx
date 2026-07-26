'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { useAllergyStore } from '@/stores/allergy-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { hlc, serializeHlc } from '@/lib/hlc'

interface AllergyEntryProps {
  patientId: string
  disabled?: boolean
}

type ClinicalStatus = 'active' | 'inactive' | 'resolved'
type AllergyType = 'allergy' | 'intolerance'
type Criticality = 'low' | 'high' | 'unable-to-assess'

const STATUS_BADGE_CLASSES: Record<ClinicalStatus, string> = {
  active: 'bg-destructive/20 text-destructive',
  inactive: 'bg-muted text-muted-foreground',
  resolved: 'bg-success/20 text-success',
}

export function AllergyEntry({ patientId, disabled }: AllergyEntryProps) {
  const t = useTranslations('allergy')
  const allergies = useAllergyStore((s) => s.allergies)
  const addAllergy = useAllergyStore((s) => s.addAllergy)
  const practitionerRef = useAuthSessionStore((s) => s.session?.practitionerId ?? '')
  const practitionerRole = useAuthSessionStore((s) => s.session?.role ?? '')

  const [substance, setSubstance] = useState('')
  const [allergyType, setAllergyType] = useState<AllergyType>('allergy')
  const [criticality, setCriticality] = useState<Criticality>('unable-to-assess')
  const [clinicalStatus, setClinicalStatus] = useState<ClinicalStatus>('active')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CRITICALITY_OPTIONS: { value: Criticality; label: string }[] = [
    { value: 'low', label: t('criticalityLow') },
    { value: 'high', label: t('criticalityHigh') },
    { value: 'unable-to-assess', label: t('criticalityUnable') },
  ]

  const TYPE_OPTIONS: { value: AllergyType; label: string }[] = [
    { value: 'allergy', label: t('typeAllergy') },
    { value: 'intolerance', label: t('typeIntolerance') },
  ]

  const STATUS_OPTIONS: { value: ClinicalStatus; label: string }[] = [
    { value: 'active', label: t('statusActive') },
    { value: 'inactive', label: t('statusInactive') },
    { value: 'resolved', label: t('statusResolved') },
  ]

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!patientId?.trim()) return
      if (!substance.trim() || isSubmitting) return
      setError(null)
      setIsSubmitting(true)

      const nowIso = new Date().toISOString()
      const hlcTimestamp = serializeHlc(hlc.now())

      const allergy: FhirAllergyIntolerance = {
        id: crypto.randomUUID(),
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const,
              code: clinicalStatus,
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const,
              code: 'unconfirmed',
            },
          ],
        },
        type: allergyType,
        criticality,
        code: {
          text: substance.trim(),
        },
        patient: {
          reference: `Patient/${patientId}`,
        },
        recordedDate: nowIso,
        recorder: practitionerRef
          ? { reference: `Practitioner/${practitionerRef}` }
          : undefined,
        _ultranos: {
          substanceFreeText: substance.trim(),
          createdAt: nowIso,
          recordedByRole: practitionerRole,
          isOfflineCreated: !navigator.onLine,
          hlcTimestamp,
        },
        meta: {
          lastUpdated: nowIso,
        },
      }

      try {
        await addAllergy(allergy)
        setSubstance('')
        setAllergyType('allergy')
        setCriticality('unable-to-assess')
        setClinicalStatus('active')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errorAddFailed'))
      } finally {
        setIsSubmitting(false)
      }
    },
    [substance, allergyType, criticality, clinicalStatus, isSubmitting, patientId, practitionerRef, practitionerRole, addAllergy],
  )

  const inputClasses =
    'w-full rounded-xl border border-border bg-background ps-4 pe-4 py-2.5 ' +
    'text-base text-foreground placeholder:text-muted-foreground ' +
    'transition-colors focus:outline-none focus:ring-2 ' +
    'focus:border-primary focus:ring-ring ' +
    'disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold tracking-tight text-foreground">
        {t('title')}
      </h3>

      {/* Existing allergies list */}
      {allergies.length > 0 && (
        <ul className="space-y-2" aria-label={t('patientAllergiesAria')}>
          {allergies.map((a) => {
            const status = a.clinicalStatus.coding[0]?.code as ClinicalStatus
            return (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl ring-[0.65px] ring-border/50 bg-background ps-4 pe-4 py-3"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    {a._ultranos.substanceFreeText || a.code.text || t('unknownSubstance')}
                  </span>
                  <span className="ms-2 text-sm text-muted-foreground">
                    ({a.type} &middot; {a.criticality})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {a.verificationStatus?.coding[0]?.code === 'confirmed' ? t('confirmed') : t('unconfirmed')}
                  </span>
                  <span
                    className={`rounded-full ps-3 pe-3 py-1 text-xs font-bold ${STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES.active}`}
                  >
                    {status}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add allergy form */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl ring-[0.65px] ring-border/50 bg-muted p-4">
        <div>
          <label htmlFor="allergy-substance" className="mb-1 block text-sm font-semibold text-foreground">
            {t('substance')}
          </label>
          <input
            id="allergy-substance"
            type="text"
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
            placeholder={t('substancePlaceholder')}
            disabled={disabled}
            className={inputClasses}
            aria-label={t('substance')}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="allergy-type" className="mb-1 block text-sm font-semibold text-foreground">
              {t('reactionType')}
            </label>
            <select
              id="allergy-type"
              value={allergyType}
              onChange={(e) => setAllergyType(e.target.value as AllergyType)}
              disabled={disabled}
              className={inputClasses}
              aria-label={t('reactionType')}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="allergy-criticality" className="mb-1 block text-sm font-semibold text-foreground">
              {t('criticality')}
            </label>
            <select
              id="allergy-criticality"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value as Criticality)}
              disabled={disabled}
              className={inputClasses}
              aria-label={t('criticality')}
            >
              {CRITICALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="allergy-clinical-status" className="mb-1 block text-sm font-semibold text-foreground">
              {t('clinicalStatus')}
            </label>
            <select
              id="allergy-clinical-status"
              value={clinicalStatus}
              onChange={(e) => setClinicalStatus(e.target.value as ClinicalStatus)}
              disabled={disabled}
              className={inputClasses}
              aria-label={t('clinicalStatus')}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
        )}

        <Button
          variant="danger"
          type="submit"
          disabled={disabled || !substance.trim() || isSubmitting}
        >
          {isSubmitting ? t('adding') : t('addAllergy')}
        </Button>
      </form>
    </div>
  )
}
