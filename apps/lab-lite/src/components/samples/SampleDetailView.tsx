'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FhirSpecimen, PatientVerificationRecord } from '@ultranos/shared-types'
import type { CustodyEvent } from '@/types/custody-event'
import { transitionSampleStatus } from '@/lib/sample-service'
import { getCustodyEventsForSample, getVerificationBySampleId, getActiveLock } from '@/lib/db'
import { reportTransportAuditEvent } from '@/lib/audit-client'
import type { SampleLock } from '@/lib/db'
import { acquireLock, releaseLock } from '@/lib/sample-lock-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { MessageSquare } from '@ultranos/ui-kit/icons'
import type { ConsultationRequest, ConsultationResponse } from '@/lib/consultation'
import { getConsultationsForSample, getResponseForRequest } from '@/lib/consultation-sync'
import { SampleStatusBadge } from './SampleStatusBadge'
import { CustodyTimeline } from './CustodyTimeline'
import { RecordHandoffModal } from './RecordHandoffModal'
import { LockIndicator } from './LockIndicator'
import { SampleLockBlocker } from './SampleLockBlocker'

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
  const [transportFlagsAcknowledged, setTransportFlagsAcknowledged] = useState(false)
  const [activeLock, setActiveLock] = useState<SampleLock | null>(null)
  const [lockBlocker, setLockBlocker] = useState<{ lockedByName: string; lockedAt: string } | null>(null)
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false)
  const [consultationNotes, setConsultationNotes] = useState<Array<{
    request: ConsultationRequest
    response: ConsultationResponse
  }>>([]);

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

  // Load current active lock for this sample (for LockIndicator + Release button)
  useEffect(() => {
    getActiveLock(specimen.id)
      .then((lock) => setActiveLock(lock ?? null))
      .catch(() => setActiveLock(null))
  }, [specimen.id])

  // Load consultation responses for this sample (AC 7, Story 53.4)
  useEffect(() => {
    getConsultationsForSample(specimen.id)
      .then(async (requests) => {
        const notes = await Promise.all(
          requests.map(async (req) => {
            const resp = await getResponseForRequest(req.id)
            return resp ? { request: req, response: resp } : null
          })
        )
        setConsultationNotes(notes.filter((n): n is { request: ConsultationRequest; response: ConsultationResponse } => n !== null))
      })
      .catch(() => {}) // non-critical
  }, [specimen.id])

  async function handleBeginProcessing() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      // AC 1/2: acquire lock before transitioning to in-processing
      const techName = session?.practitionerName ?? actorId
      const lockResult = await acquireLock(specimen.id, actorId, techName)
      if (!lockResult.success) {
        setLockBlocker({ lockedByName: lockResult.lockedBy, lockedAt: lockResult.lockedAt })
        return
      }
      await transitionSampleStatus(specimen.id, 'in-processing', actorId)
      await loadEvents()
      const lock = await getActiveLock(specimen.id)
      setActiveLock(lock ?? null)
      onStatusChange?.({ ...specimen, _ultranos: { ...specimen._ultranos, pipelineStatus: 'in-processing' } })
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : t('errors.transitionFailed'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleManualRelease() {
    setShowReleaseConfirm(false)
    try {
      await releaseLock(specimen.id, actorId, 'MANUAL')
      await transitionSampleStatus(specimen.id, 'received', actorId)
      setActiveLock(null)
      await loadEvents()
      onStatusChange?.({ ...specimen, _ultranos: { ...specimen._ultranos, pipelineStatus: 'received' } })
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : t('errors.transitionFailed'))
    }
  }

  async function handleTransition(
    newStatus: 'in-processing' | 'completed' | 'reported',
  ) {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      await transitionSampleStatus(specimen.id, newStatus, actorId)
      await loadEvents()
      onStatusChange?.({ ...specimen, _ultranos: { ...specimen._ultranos, pipelineStatus: newStatus } })

      // INTEGRATION: Story 43.1 — emit lab lifecycle audit events on status transitions.
      // Call reportLabLifecycleEvent() here once Story 42.3 pipeline is fully wired.
      // Transition map:
      //   'in-processing' → SAMPLE_PROCESSED
      //   'completed'     → RESULT_ENTERED  (result data saved to template)
      //   'reported'      → RESULT_RELEASED  (result released to ordering physician)
      //
      // Example (uncomment and import reportLabLifecycleEvent from '@/lib/audit-client'):
      // if (newStatus === 'in-processing') {
      //   reportLabLifecycleEvent({ event: 'SAMPLE_PROCESSED', sampleId: specimen.id })
      // } else if (newStatus === 'completed') {
      //   reportLabLifecycleEvent({ event: 'RESULT_ENTERED', sampleId: specimen.id })
      // } else if (newStatus === 'reported') {
      //   reportLabLifecycleEvent({ event: 'RESULT_RELEASED', sampleId: specimen.id })
      // }
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : t('errors.transitionFailed'))
    } finally {
      setIsTransitioning(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="sample-detail-view">
      {/* AC 2: Lock blocker dialog — shown when another tech holds an active lock */}
      {lockBlocker && (
        <SampleLockBlocker
          lockedByName={lockBlocker.lockedByName}
          lockedAt={lockBlocker.lockedAt}
          onDismiss={() => setLockBlocker(null)}
          onRequestRelease={async () => {
            const { requestRelease } = await import('@/lib/sample-lock-service')
            await requestRelease(specimen.id, actorId)
          }}
        />
      )}

      {/* Pre-analytical transport flags (AC 4, Story 54.3) — must acknowledge before processing */}
      {specimen._ultranos.transportFlags && specimen._ultranos.transportFlags.length > 0 && !transportFlagsAcknowledged && (
        <div
          className="rounded-xl border border-red-400 bg-red-50 p-5 space-y-3"
          role="alert"
          data-testid="pre-analytical-flag-banner"
        >
          <div className="flex items-start gap-3">
            <span className="text-red-600 text-xl font-bold" aria-hidden>⚠</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">
                Pre-Analytical Concern — Transport Flag
              </p>
              <ul className="mt-2 space-y-1">
                {specimen._ultranos.transportFlags.map((flag, i) => (
                  <li key={i} className="text-sm text-red-700">
                    {flag.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setTransportFlagsAcknowledged(true)
              // P18: emit audit event on flag acknowledgment (CLAUDE.md Rule #6)
              reportTransportAuditEvent({
                action: 'TRANSPORT_FLAG_ACKNOWLEDGED',
                transportSessionId: specimen.id,
                courierId: actorId,
                sampleCount: specimen._ultranos.transportFlags?.length ?? 0,
              })
            }}
            className="w-full rounded-lg border border-red-300 bg-card px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            data-testid="acknowledge-transport-flag-button"
          >
            I acknowledge this sample has a pre-analytical concern
          </button>
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        {/* Sample ID + status */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('detail.sampleId')}
            </p>
            <p
              className="text-2xl font-bold font-mono text-foreground mt-0.5"
              data-testid="sample-lab-id"
            >
              {specimen._ultranos.labSampleId}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SampleStatusBadge status={pipelineStatus} />
            {/* AC 6: Lock indicator visible in sample detail header */}
            <LockIndicator lock={activeLock} />
          </div>
        </div>

        {/* Sample type + verification badge */}
        <div className="flex gap-2 flex-wrap items-center">
          {specimen.type?.coding?.[0]?.display && (
            <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
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
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {t('detail.patient')}
          </h3>
          <p className="text-sm text-foreground" data-testid="patient-display">
            {patientDisplay.firstName},{' '}
            <span className="text-muted-foreground">
              {t('detail.age', { age: patientDisplay.age })}
            </span>
          </p>
        </div>
      )}

      {/* Ordered tests */}
      {orderedTests.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {t('detail.orderedTests')}
          </h3>
          <ul className="space-y-1">
            {orderedTests.map((test) => (
              <li key={test.loincCode} className="text-sm text-foreground">
                {test.display}
                <span className="ms-1.5 text-xs text-muted-foreground font-mono">
                  {test.loincCode}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons — contextual by status */}
      {pipelineStatus !== 'rejected' && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
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
                onClick={handleBeginProcessing}
                disabled={isTransitioning || (!transportFlagsAcknowledged && !!(specimen._ultranos.transportFlags?.length))}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                data-testid="begin-processing-button"
              >
                {t('actions.beginProcessing')}
              </button>
            )}

            {/* AC 4: Manual release — only shown to the lock holder */}
            {pipelineStatus === 'in-processing' && activeLock?.techId === actorId && (
              !showReleaseConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowReleaseConfirm(true)}
                  className="rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100"
                  data-testid="release-sample-button"
                >
                  {t('actions.releaseSample')}
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800" data-testid="release-confirm">
                  <span>{t('actions.confirmRelease', { sampleId: specimen._ultranos.labSampleId })}</span>
                  <button type="button" onClick={handleManualRelease} className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700">
                    {t('actions.confirm')}
                  </button>
                  <button type="button" onClick={() => setShowReleaseConfirm(false)} className="text-xs text-yellow-700 underline">
                    {t('actions.cancel')}
                  </button>
                </div>
              )
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
              <p className="text-sm text-muted-foreground italic">
                {t('actions.awaitingAuthorization')}
              </p>
            )}

            {/* Record Handoff — available in any non-terminal state */}
            <button
              type="button"
              onClick={() => setShowHandoffModal(true)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30"
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
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">
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

      {/* Consultation Notes (AC 7, Story 53.4) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('detail.consultationNotes')}
        </h3>
        {consultationNotes.length === 0 ? (
          <EmptyState
            size="sm"
            icon={MessageSquare}
            title={t('detail.noConsultationNotes')}
          />
        ) : (
          <ul className="space-y-4">
            {consultationNotes.map(({ request, response }) => (
              <li key={response.id} className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  {response.respondentName}
                  {response.respondentCredentials && (
                    <span className="ms-1 text-muted-foreground font-normal">
                      {response.respondentCredentials}
                    </span>
                  )}
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {response.responseText}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(response.receivedAt).toLocaleDateString()}
                  <span className="ms-2 font-mono text-xs opacity-60">
                    {request.recipientType === 'pathologist' ? t('detail.consultPathologist') : t('detail.consultReferenceLab')}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
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
