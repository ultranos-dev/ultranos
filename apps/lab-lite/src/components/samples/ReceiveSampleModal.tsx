'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import type { PatientVerificationRecord, SampleCondition } from '@ultranos/shared-types'
import { accessionSample, rejectSample } from '@/lib/sample-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { LabOrderEntry } from '@/lib/db'
import { saveVerificationRecord } from '@/lib/db'
import { analyzeTripRequirements } from '@/lib/trip-optimizer'
import { saveTripResult } from '@/lib/patient-queue'
import { TripRecommendation } from '@/components/orders/TripRecommendation'
import type { TripAnalysis } from '@/lib/trip-optimizer'
import { PatientVerificationForm } from '@/components/verification/PatientVerificationForm'
import { getDefaultMethodsForSource } from '@/lib/verification-service'
import type { PatientLookupSource } from '@/lib/verification-service'

// Condition → standard rejection reasons mapping
const REJECTION_REASONS: Record<Exclude<SampleCondition, 'acceptable'>, string[]> = {
  hemolyzed: ['Hemolysis detected — unable to process', 'Severe hemolysis — recollect required'],
  clotted: ['Sample clotted — unable to process', 'Fibrin clot present — recollect required'],
  insufficient: ['Insufficient volume for requested tests', 'Minimum volume not met'],
  mislabeled: ['Label missing', 'Label information mismatch — verify patient identity'],
}

type Step = 'verification' | 'sampleDetails'

export interface ReceiveSampleModalProps {
  /** The electronic order to receive the sample against */
  orderId: string
  /** Opaque Patient/<uuid> reference — never raw name */
  patientRef: string
  onClose: () => void
  onSuccess: (labSampleId: string) => void
  /** Active orders for this patient — used to run trip optimizer after collection */
  orders?: LabOrderEntry[]
  /** Queue entry ID — used to persist trip result (optional) */
  queueEntryId?: number
  /** Patient token for print card (no PHI) */
  patientToken?: string
  /** How the patient was originally looked up — drives QR auto-check in verification */
  verificationSource?: PatientLookupSource
  /** Practitioner UUID of the technician performing the collection */
  verifiedBy?: string
}

export function ReceiveSampleModal({
  orderId,
  patientRef,
  onClose,
  onSuccess,
  orders,
  queueEntryId,
  patientToken,
  verificationSource,
  verifiedBy,
}: ReceiveSampleModalProps) {
  const t = useTranslations('samples')
  const session = useAuthSessionStore((s) => s.session)

  const [step, setStep] = useState<Step>('verification')
  const [verificationRecord, setVerificationRecord] = useState<PatientVerificationRecord | null>(null)
  const [sampleType, setSampleType] = useState('blood')
  const [condition, setCondition] = useState<SampleCondition>('acceptable')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [notes, setNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Populated after successful accessioning — triggers confirmation step */
  const [confirmedSampleId, setConfirmedSampleId] = useState<string | null>(null)
  const [tripAnalysis, setTripAnalysis] = useState<TripAnalysis | null>(null)

  const techId = verifiedBy ?? session?.practitionerId ?? 'unknown'
  const isNonAcceptable = condition !== 'acceptable'
  const rejectionOptions = isNonAcceptable ? REJECTION_REASONS[condition] : []

  function handleVerificationComplete(record: PatientVerificationRecord) {
    setVerificationRecord(record)
    setStep('sampleDetails')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      if (condition === 'acceptable') {
        const specimen = await accessionSample({
          orderId,
          sampleType,
          condition,
          receivedFromId: receivedFrom || (session?.practitionerId ?? 'unknown'),
          notes: notes || undefined,
          patientRef,
          idPrefix: undefined, // uses lab default 'LAB'
        })
        // Link verification record to the actual specimen ID (3.3 — sampleId linkage)
        if (verificationRecord) {
          const linked: PatientVerificationRecord = { ...verificationRecord, sampleId: specimen.id }
          await saveVerificationRecord(linked)
        }
        // Run trip optimizer if orders are provided
        if (orders && orders.length > 0) {
          const today = new Date().toISOString().slice(0, 10)
          const analysis = analyzeTripRequirements(orders, today)
          setTripAnalysis(analysis)
          if (queueEntryId != null) {
            saveTripResult(queueEntryId, JSON.stringify(analysis)).catch(() => {
              // ephemeral — ignore save failures
            })
          }
        }
        setConfirmedSampleId(specimen._ultranos.labSampleId)

        // INTEGRATION: Story 43.1 — emit SAMPLE_RECEIVED audit event.
        // Call reportLabLifecycleEvent() here once wired up.
        // Example (import reportLabLifecycleEvent from '@/lib/audit-client'):
        // reportLabLifecycleEvent({
        //   event: 'SAMPLE_RECEIVED',
        //   sampleId: specimen.id,
        //   orderId,
        //   custodyFrom: receivedFrom || undefined,
        //   custodyTo: session?.practitionerId,
        // })
      } else {
        if (!rejectionReason) {
          setError(t('validation.rejectionReasonRequired'))
          return
        }
        // First accession to assign a sample ID, then immediately reject
        const specimen = await accessionSample({
          orderId,
          sampleType,
          condition,
          receivedFromId: receivedFrom || (session?.practitionerId ?? 'unknown'),
          notes: notes || undefined,
          patientRef,
          idPrefix: undefined,
        })
        // Link verification record to the actual specimen ID
        if (verificationRecord) {
          const linked: PatientVerificationRecord = { ...verificationRecord, sampleId: specimen.id }
          await saveVerificationRecord(linked)
        }
        await rejectSample(
          specimen.id,
          rejectionReason,
          session?.practitionerId ?? 'unknown',
        )
        setConfirmedSampleId(specimen._ultranos.labSampleId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.accessionFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 1 — Patient identity verification (mandatory before sample details)
  if (step === 'verification') {
    const defaultMethods = verificationSource ? getDefaultMethodsForSource(verificationSource) : []
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-step-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        data-testid="verification-step"
      >
        <div className="w-full max-w-lg rounded-xl bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 id="verification-step-title" className="text-lg font-semibold text-foreground">
              {t('modal.patientVerification')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('modal.close')}
              className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="px-2 py-2">
            <PatientVerificationForm
              sampleId={orderId}
              patientRef={patientRef}
              verifiedBy={techId}
              onComplete={handleVerificationComplete}
              defaultMethods={defaultMethods}
              verificationSource={verificationSource}
            />
          </div>
        </div>
      </div>
    )
  }

  // Confirmation screen — shown after successful accessioning
  if (confirmedSampleId !== null) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        data-testid="sample-collection-confirmation"
      >
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-xl">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <h2 id="confirmation-title" className="text-lg font-semibold text-foreground">
              {t('modal.sampleReceived')}
            </h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('modal.sampleId')}: <span className="font-mono font-bold">{confirmedSampleId}</span>
            </p>
            {tripAnalysis && (
              <TripRecommendation
                analysis={tripAnalysis}
                patientToken={patientToken}
              />
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                data-testid="confirmation-done-button"
                onClick={() => onSuccess(confirmedSampleId)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {t('modal.done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Step 2 — Sample details form
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receive-sample-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="receive-sample-modal"
    >
      <div className="w-full max-w-lg rounded-xl bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="receive-sample-title" className="text-lg font-semibold text-foreground">
            {t('modal.receiveTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modal.close')}
            className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Sample Type */}
          <div className="space-y-1">
            <label htmlFor="sample-type" className="text-sm font-medium text-foreground">
              {t('form.sampleType')}
            </label>
            <select
              id="sample-type"
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="sample-type-select"
            >
              <option value="blood">{t('sampleTypes.blood')}</option>
              <option value="urine">{t('sampleTypes.urine')}</option>
              <option value="swab">{t('sampleTypes.swab')}</option>
              <option value="csf">{t('sampleTypes.csf')}</option>
              <option value="stool">{t('sampleTypes.stool')}</option>
              <option value="other">{t('sampleTypes.other')}</option>
            </select>
          </div>

          {/* Condition at Receipt */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">
              {t('form.conditionAtReceipt')}
            </legend>
            <div className="space-y-1.5" data-testid="condition-group">
              {(['acceptable', 'hemolyzed', 'clotted', 'insufficient', 'mislabeled'] as SampleCondition[]).map(
                (c) => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="condition"
                      value={c}
                      checked={condition === c}
                      onChange={() => {
                        setCondition(c)
                        setRejectionReason('')
                      }}
                      className="h-4 w-4 text-blue-600"
                      data-testid={`condition-${c}`}
                    />
                    <span className="text-sm text-foreground">{t(`conditions.${c}`)}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>

          {/* Rejection reason — shown only when condition is not acceptable */}
          {isNonAcceptable && (
            <div className="space-y-1" data-testid="rejection-reason-section">
              <label htmlFor="rejection-reason" className="text-sm font-medium text-red-700">
                {t('form.rejectionReason')}
              </label>
              <select
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                data-testid="rejection-reason-select"
              >
                <option value="">{t('form.selectRejectionReason')}</option>
                {rejectionOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              <p className="text-xs text-red-600 mt-1">{t('form.rejectionNotice')}</p>
            </div>
          )}

          {/* Received From */}
          <div className="space-y-1">
            <label htmlFor="received-from" className="text-sm font-medium text-foreground">
              {t('form.receivedFrom')}
            </label>
            <input
              id="received-from"
              type="text"
              value={receivedFrom}
              onChange={(e) => setReceivedFrom(e.target.value)}
              placeholder={t('form.receivedFromPlaceholder')}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="received-from-input"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="sample-notes" className="text-sm font-medium text-foreground">
              {t('form.notes')}
            </label>
            <textarea
              id="sample-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('form.notesPlaceholder')}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              data-testid="notes-input"
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-red-600" data-testid="form-error">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 disabled:opacity-50"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                isNonAcceptable
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              data-testid="submit-button"
            >
              {isSubmitting
                ? t('form.processing')
                : isNonAcceptable
                  ? t('form.confirmRejection')
                  : t('form.receiveSample')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
