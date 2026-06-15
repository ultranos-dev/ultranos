'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { PatientVerificationMethod } from '@ultranos/shared-types'
import type { PatientVerificationRecord } from '@ultranos/shared-types'
import {
  createVerificationRecord,
  validateVerification,
  isVerificationComplete,
  buildAuditMetadata,
  type PatientLookupSource,
} from '@/lib/verification-service'
import { saveVerificationRecord } from '@/lib/db'
import { reportVerificationEvent } from '@/lib/audit-client'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PatientVerificationFormProps {
  sampleId: string
  /** Opaque Patient/<uuid> — never a patient name (CLAUDE.md Rule #7) */
  patientRef: string
  /** Practitioner UUID of the technician performing verification */
  verifiedBy: string
  /** Called when verification is complete and user clicks Proceed */
  onComplete: (record: PatientVerificationRecord) => void
  /**
   * Methods that should be pre-selected based on how patient was initially
   * looked up (e.g. QR_CODE if patient was found via QR scan).
   * Story 43.4 Task 6: QR code auto-integration.
   */
  defaultMethods?: PatientVerificationMethod[]
  /** Used to display a label for QR auto-import */
  verificationSource?: PatientLookupSource
}

// ---------------------------------------------------------------------------
// Method configuration
// ---------------------------------------------------------------------------

interface MethodConfig {
  method: PatientVerificationMethod
  labelKey: string
  descriptionKey?: string
  requiresDetail?: boolean
  detailLabelKey?: string
  detailPlaceholderKey?: string
}

const VERIFICATION_METHODS: MethodConfig[] = [
  {
    method: PatientVerificationMethod.NATIONAL_ID_SCANNED,
    labelKey: 'verification.method.nationalId',
    descriptionKey: 'verification.method.nationalId.desc',
    requiresDetail: true,
    detailLabelKey: 'verification.method.nationalId.detail',
    detailPlaceholderKey: 'verification.method.nationalId.placeholder',
  },
  {
    method: PatientVerificationMethod.VERBAL_CONFIRMATION,
    labelKey: 'verification.method.verbal',
    descriptionKey: 'verification.method.verbal.desc',
  },
  {
    method: PatientVerificationMethod.QR_CODE,
    labelKey: 'verification.method.qrCode',
    descriptionKey: 'verification.method.qrCode.desc',
  },
  {
    method: PatientVerificationMethod.OTHER,
    labelKey: 'verification.method.other',
    requiresDetail: true,
    detailLabelKey: 'verification.method.other.detail',
    detailPlaceholderKey: 'verification.method.other.placeholder',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Patient identity verification form — Story 43.4.
 *
 * Implements the WHO two-identifier minimum standard. Tech selects which
 * verification methods were used; single-identifier requires a deviation reason.
 *
 * PHI rules (CLAUDE.md Rule #7):
 *  - National ID: stores only last-4 indicator, not the full number.
 *  - Verbal confirmation: stores only that it occurred, not what was said.
 *  - QR scan: stores only that it was scanned, not the payload content.
 *
 * RTL: all layout uses logical CSS properties (inline/block, start/end).
 */
export function PatientVerificationForm({
  sampleId,
  patientRef,
  verifiedBy,
  onComplete,
  defaultMethods = [],
  verificationSource,
}: PatientVerificationFormProps) {
  const t = useTranslations()

  // Selected verification methods
  const [selectedMethods, setSelectedMethods] = useState<Set<PatientVerificationMethod>>(
    new Set(defaultMethods),
  )
  // Optional detail inputs (for NATIONAL_ID last-4, OTHER description)
  const [methodDetails, setMethodDetails] = useState<Partial<Record<PatientVerificationMethod, string>>>({})
  // Override state: single-identifier acknowledged
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [deviationReason, setDeviationReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const methodsArray = Array.from(selectedMethods)
  const complete = isVerificationComplete(methodsArray)
  const showWarning = !complete && selectedMethods.size === 1
  const validation = validateVerification(
    methodsArray,
    overrideEnabled ? deviationReason : undefined,
  )
  const canProceed = validation.canProceed && !isSubmitting

  const toggleMethod = useCallback((method: PatientVerificationMethod) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev)
      if (next.has(method)) {
        next.delete(method)
        // Reset override when re-selecting
      } else {
        next.add(method)
      }
      return next
    })
    // Reset override when method set changes
    setOverrideEnabled(false)
    setDeviationReason('')
  }, [])

  const handleDetailChange = useCallback(
    (method: PatientVerificationMethod, value: string) => {
      setMethodDetails((prev) => ({ ...prev, [method]: value }))
    },
    [],
  )

  async function handleProceed() {
    if (!canProceed) return
    setIsSubmitting(true)

    try {
      const otherDescription =
        selectedMethods.has(PatientVerificationMethod.OTHER)
          ? (methodDetails[PatientVerificationMethod.OTHER] ?? '')
          : undefined

      const record = createVerificationRecord({
        sampleId,
        patientRef,
        methods: methodsArray,
        ...(otherDescription ? { otherDescription } : {}),
        verifiedBy,
        ...(overrideEnabled && deviationReason ? { deviationReason } : {}),
      })

      await saveVerificationRecord(record)

      const meta = buildAuditMetadata({
        sampleId,
        methods: methodsArray,
        isComplete: record.isComplete,
        verifiedBy,
        ...(record.deviationReason ? { deviationReason: record.deviationReason } : {}),
      })
      reportVerificationEvent(meta)

      onComplete(record)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Completeness indicator
  const completenessIndicator = complete ? (
    <span
      className="inline-flex items-center gap-1 text-green-700 text-sm font-medium"
      data-testid="completeness-indicator"
      aria-label={t('verification.complete')}
    >
      <span aria-hidden="true">✓</span>
      {t('verification.complete')}
    </span>
  ) : selectedMethods.size === 1 ? (
    <span
      className="inline-flex items-center gap-1 text-yellow-600 text-sm font-medium"
      data-testid="completeness-indicator"
    >
      <span aria-hidden="true">⚠</span>
      {t('verification.incomplete')}
    </span>
  ) : null

  return (
    <div
      dir="auto"
      className="space-y-4 p-4"
      data-testid="patient-verification-form"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {t('verification.title')}
        </h2>
        {completenessIndicator}
      </div>

      {/* QR auto-import notice */}
      {verificationSource === 'qr' && defaultMethods.includes(PatientVerificationMethod.QR_CODE) && (
        <p className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded" data-testid="qr-import-notice">
          {t('verification.qrImported')}
        </p>
      )}

      {/* Method checkboxes */}
      <fieldset className="space-y-3">
        <legend className="sr-only">{t('verification.methods.legend')}</legend>
        {VERIFICATION_METHODS.map((config) => {
          const checked = selectedMethods.has(config.method)
          const isQrAutoChecked =
            config.method === PatientVerificationMethod.QR_CODE &&
            defaultMethods.includes(PatientVerificationMethod.QR_CODE)

          return (
            <div key={config.method} className="space-y-1">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid={`method-${config.method}`}
                  checked={checked}
                  readOnly={isQrAutoChecked}
                  onChange={() => !isQrAutoChecked && toggleMethod(config.method)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-describedby={config.descriptionKey ? `desc-${config.method}` : undefined}
                />
                <span className="text-sm text-gray-800">{t(config.labelKey)}</span>
              </label>

              {config.descriptionKey && (
                <p id={`desc-${config.method}`} className="text-xs text-gray-500 ms-6">
                  {t(config.descriptionKey)}
                </p>
              )}

              {/* Detail input (shown when method is selected AND has detail) */}
              {config.requiresDetail && checked && (
                <div className="ms-6 mt-1">
                  <label className="block text-xs text-gray-600 mb-1">
                    {config.detailLabelKey ? t(config.detailLabelKey) : ''}
                  </label>
                  <input
                    type="text"
                    data-testid={`detail-${config.method}`}
                    value={methodDetails[config.method] ?? ''}
                    onChange={(e) => handleDetailChange(config.method, e.target.value)}
                    placeholder={config.detailPlaceholderKey ? t(config.detailPlaceholderKey) : ''}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={config.method === PatientVerificationMethod.NATIONAL_ID_SCANNED ? 4 : 200}
                  />
                </div>
              )}
            </div>
          )
        })}
      </fieldset>

      {/* Single-identifier warning banner (AC #3) */}
      {showWarning && (
        <div
          role="alert"
          className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 space-y-2"
          data-testid="single-id-warning"
        >
          <p className="font-medium">{t('verification.warning.singleIdentifier')}</p>
          <p className="text-xs">{t('verification.warning.singleIdentifier.detail')}</p>

          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="override-checkbox"
              checked={overrideEnabled}
              onChange={(e) => {
                setOverrideEnabled(e.target.checked)
                if (!e.target.checked) setDeviationReason('')
              }}
              className="h-4 w-4 rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
            />
            <span className="text-xs font-medium">{t('verification.override.label')}</span>
          </label>

          {overrideEnabled && (
            <div className="mt-1 space-y-1">
              <label className="block text-xs font-medium text-yellow-800">
                {t('verification.override.reasonLabel')}
                <span className="text-red-600 ms-0.5">*</span>
              </label>
              <textarea
                data-testid="deviation-reason-input"
                value={deviationReason}
                onChange={(e) => setDeviationReason(e.target.value)}
                placeholder={t('verification.override.reasonPlaceholder')}
                className="w-full rounded border border-yellow-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
                rows={2}
                minLength={10}
                maxLength={500}
              />
              {deviationReason.length > 0 && deviationReason.length < 10 && (
                <p className="text-xs text-red-600">{t('verification.override.reasonTooShort')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Proceed button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleProceed}
          disabled={!canProceed}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={t('verification.proceed')}
        >
          {isSubmitting ? t('verification.proceeding') : t('verification.proceed')}
        </button>
      </div>
    </div>
  )
}
