'use client'

import { useState, useCallback } from 'react'
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

const CRITICALITY_OPTIONS: { value: Criticality; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'unable-to-assess', label: 'Unable to assess' },
]

const TYPE_OPTIONS: { value: AllergyType; label: string }[] = [
  { value: 'allergy', label: 'Allergy' },
  { value: 'intolerance', label: 'Intolerance' },
]

const STATUS_OPTIONS: { value: ClinicalStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'resolved', label: 'Resolved' },
]

const STATUS_BADGE_CLASSES: Record<ClinicalStatus, string> = {
  active: 'bg-red-100 text-red-700',
  inactive: 'bg-neutral-100 text-neutral-600',
  resolved: 'bg-green-100 text-green-700',
}

export function AllergyEntry({ patientId, disabled }: AllergyEntryProps) {
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
        setError(err instanceof Error ? err.message : 'Failed to add allergy')
      } finally {
        setIsSubmitting(false)
      }
    },
    [substance, allergyType, criticality, clinicalStatus, isSubmitting, patientId, practitionerRef, practitionerRole, addAllergy],
  )

  const inputClasses =
    'w-full rounded-lg border border-neutral-200 bg-white ps-4 pe-4 py-2.5 ' +
    'text-base text-neutral-900 placeholder:text-neutral-400 ' +
    'transition-colors focus:outline-none focus:ring-2 ' +
    'focus:border-primary-400 focus:ring-primary-200 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-black tracking-tight text-neutral-900">
        Allergies
      </h3>

      {/* Existing allergies list */}
      {allergies.length > 0 && (
        <ul className="space-y-2" aria-label="Patient allergies">
          {allergies.map((a) => {
            const status = a.clinicalStatus.coding[0]?.code as ClinicalStatus
            return (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white ps-4 pe-4 py-3"
              >
                <div>
                  <span className="font-semibold text-neutral-900">
                    {a._ultranos.substanceFreeText || a.code.text || 'Unknown substance'}
                  </span>
                  <span className="ms-2 text-sm text-neutral-500">
                    ({a.type} &middot; {a.criticality})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">
                    {a.verificationStatus?.coding[0]?.code === 'confirmed' ? '✓ confirmed' : 'unconfirmed'}
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
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-neutral-100 bg-neutral-50 p-4">
        <div>
          <label htmlFor="allergy-substance" className="mb-1 block text-sm font-semibold text-neutral-700">
            Substance
          </label>
          <input
            id="allergy-substance"
            type="text"
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
            placeholder="e.g., Penicillin, Peanuts, Latex..."
            disabled={disabled}
            className={inputClasses}
            aria-label="Allergy substance"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="allergy-type" className="mb-1 block text-sm font-semibold text-neutral-700">
              Reaction Type
            </label>
            <select
              id="allergy-type"
              value={allergyType}
              onChange={(e) => setAllergyType(e.target.value as AllergyType)}
              disabled={disabled}
              className={inputClasses}
              aria-label="Reaction type"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="allergy-criticality" className="mb-1 block text-sm font-semibold text-neutral-700">
              Criticality
            </label>
            <select
              id="allergy-criticality"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value as Criticality)}
              disabled={disabled}
              className={inputClasses}
              aria-label="Criticality"
            >
              {CRITICALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="allergy-clinical-status" className="mb-1 block text-sm font-semibold text-neutral-700">
              Clinical Status
            </label>
            <select
              id="allergy-clinical-status"
              value={clinicalStatus}
              onChange={(e) => setClinicalStatus(e.target.value as ClinicalStatus)}
              disabled={disabled}
              className={inputClasses}
              aria-label="Clinical status"
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
          <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={disabled || !substance.trim() || isSubmitting}
          className={
            'rounded-lg bg-red-600 ps-6 pe-6 py-2.5 text-sm font-bold text-white ' +
            'transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {isSubmitting ? 'Adding...' : 'Add Allergy'}
        </button>
      </form>
    </div>
  )
}
