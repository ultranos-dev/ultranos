'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FhirSpecimen, PatientVerificationRecord } from '@ultranos/shared-types'
import type { CustodyEvent } from '@/types/custody-event'
import { transitionSampleStatus } from '@/lib/sample-service'
import { getCustodyEventsForSample, getVerificationBySampleId } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { SampleStatusBadge } from './SampleStatusBadge'
import { CustodyTimeline } from './CustodyTimeline'
import { RecordHandoffModal } from './RecordHandoffModal'

/**
 * SampleDetailView — full view for a single sample.
 * Shows: sample ID, status, patient reference (first name + age only — Rule #7),
 * ordered tests, contextual action buttons, and chain-of-custody timeline.
 *
 * AC 3, 4, 5, 6, 8.3, 8.4
 */
interface SampleDetailViewProps {
  specimen: FhirSpecimen
  /** Patient display info — first name + age ONLY (CLAUDE.md Rule #7) */
  patientDisplay?: { firstName: string; age: number }
  /** Ordered test display names */
  orderedTests?: Array<{ loincCode: string; display: string }>
  /** Optional: practitioner name cache for timeline display */
  practitionerNames?: Record<string, string>
  onStatusChange?: (updated: FhirSpecimen) => void
}

export function SampleDetailView({
  specimen,
  patientDisplay,
  orderedTests = [],
  practitionerNames = {},
  onStatusChange,
}: SampleDetailViewProps) {
  const t = useTranslations('samples')
  const session = useAuthSessionStore((s) => s.session)
  const actorId = session?.practitionerId ?? 'unknown'

  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([])
  const [verificationRecord, setVerificationRecord] = useState<PatientVerificationRecord | null | undefined>(undefined)
  const [showHandoffModal, setShowHandoffModal] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const pipelineStatus = specimen._ultranos.pipelineStatus

  const loadEvents = useCallback(async () => {
    const events = await getCustodyEventsForSample(specimen.id)
    setCustodyEvents(events)
  }, [specimen.id])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  useEffect(() => {
    getVerificationBySampleId(specimen.id)
      .then((rec) => setVerificationRecord(rec ?? null))
      .catch(() => setVerificationRecord(null))
  }, [specimen.id])

  async function handleTransition(
    newStatus: 'in-processing' | 'completed' | 'reported',
  ) {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      await transitionSampleStatus(specimen.id, newStatus, actorId)
      await loadEvents()
      onStatusChange?.({ ...specimen, _ultranos: { ...specimen._ultranos, pipelineStatus: newStatus } })
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : t('errors.transitionFailed'))
    } finally {
      setIsTransitioning(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="sample-detail-view">
      {/* Header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
        {/* Sample ID + status */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
              {t('detail.sampleId')}
            </p>
            <p
              className="text-2xl font-bold font-mono text-neutral-900 mt-0.5"
              data-testid="sample-lab-id"
            >
              {specimen._ultranos.labSampleId}
            </p>
          </div>
          <SampleStatusBadge status={pipelineStatus} />
        </div>

        {/* Sample type + verification badge */}
        <div className="flex gap-2 flex-wrap items-center">
          {specimen.type?.coding?.[0]?.display && (
            <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              {specimen.type.coding[0].display}
            </span>
          )}
          {verificationRecord !== undefined && verificationRecord !== null && (
            <span
              data-testid="verification-badge"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                verificationRecord.isComplete
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              <span aria-hidden="true">{verificationRecord.isComplete ? '✓' : '⚠'}</span>
              {verificationRecord.isComplete
                ? t('detail.verificationComplete')
                : t('detail.verificationIncomplete')}
            </span>
          )}
        </div>
      </div>

      {/* Patient reference — first name + age ONLY (Rule #7) */}
      {patientDisplay && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">
            {t('detail.patient')}
          </h3>
          <p className="text-sm text-neutral-900" data-testid="patient-display">
            {patientDisplay.firstName},{' '}
            <span className="text-neutral-600">
              {t('detail.age', { age: patientDisplay.age })}
            </span>
          </p>
        </div>
      )}

      {/* Ordered tests */}
      {orderedTests.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">
            {t('detail.orderedTests')}
          </h3>
          <ul className="space-y-1">
            {orderedTests.map((test) => (
              <li key={test.loincCode} className="text-sm text-neutral-700">
                {test.display}
                <span className="ms-1.5 text-xs text-neutral-400 font-mono">
                  {test.loincCode}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons — contextual by status */}
      {pipelineStatus !== 'rejected' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-500">
            {t('detail.actions')}
          </h3>

          {transitionError && (
            <p role="alert" className="text-sm text-red-600" data-testid="transition-error">
              {transitionError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {pipelineStatus === 'received' && (
              <button
                type="button"
                onClick={() => handleTransition('in-processing')}
                disabled={isTransitioning}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                data-testid="begin-processing-button"
              >
                {t('actions.beginProcessing')}
              </button>
            )}

            {pipelineStatus === 'in-processing' && (
              <button
                type="button"
                onClick={() => handleTransition('completed')}
                disabled={isTransitioning}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                data-testid="mark-complete-button"
              >
                {t('actions.markComplete')}
              </button>
            )}

            {pipelineStatus === 'completed' && (
              <p className="text-sm text-neutral-500 italic">
                {t('actions.awaitingAuthorization')}
              </p>
            )}

            {/* Record Handoff — available in any non-terminal state */}
            <button
              type="button"
              onClick={() => setShowHandoffModal(true)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              data-testid="record-handoff-button"
            >
              {t('actions.recordHandoff')}
            </button>
          </div>
        </div>
      )}

      {/* Incomplete verification deviation — yellow highlight (AC 4.2, 4.3) */}
      {verificationRecord !== undefined && verificationRecord !== null && !verificationRecord.isComplete && (
        <div
          className="rounded-xl border border-yellow-300 bg-yellow-50 p-5 space-y-1"
          data-testid="deviation-record"
          role="alert"
        >
          <p className="text-sm font-semibold text-yellow-800">
            {t('detail.verificationDeviation')}
          </p>
          {verificationRecord.deviationReason && (
            <p className="text-xs text-yellow-700">
              {verificationRecord.deviationReason}
            </p>
          )}
        </div>
      )}

      {/* Chain of Custody Timeline */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-500 mb-4">
          {t('detail.chainOfCustody')}
        </h3>

        {/* Verification entry in timeline (AC 4.3) */}
        {verificationRecord !== undefined && verificationRecord !== null && (
          <div
            className={`mb-4 flex gap-3 rounded-lg border p-3 text-xs ${
              verificationRecord.isComplete
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-yellow-200 bg-yellow-50 text-yellow-800'
            }`}
            data-testid="verification-timeline-entry"
          >
            <span aria-hidden="true" className="shrink-0 text-base leading-none">
              {verificationRecord.isComplete ? '✓' : '⚠'}
            </span>
            <div className="space-y-0.5">
              <p className="font-medium">
                {verificationRecord.isComplete
                  ? t('detail.verificationComplete')
                  : t('detail.verificationIncomplete')}
              </p>
              <p className="opacity-75">
                {t('timeline.actor', { actor: verificationRecord.verifiedBy })}
              </p>
            </div>
          </div>
        )}

        <CustodyTimeline
          events={custodyEvents}
          practitionerNames={practitionerNames}
        />
      </div>

      {/* Handoff modal */}
      {showHandoffModal && (
        <RecordHandoffModal
          sampleId={specimen.id}
          currentActorId={actorId}
          onClose={() => setShowHandoffModal(false)}
          onSuccess={async () => {
            setShowHandoffModal(false)
            await loadEvents()
          }}
        />
      )}
    </div>
  )
}
