'use client'

/**
 * Story 42.5 — Result Review Detail Panel
 * Task 5: Slide-over showing full result details + authorization action buttons.
 *
 * Critical value banner is always visible at the top when LL or HH flags present.
 * Action buttons respect role permissions (disabled if insufficient role).
 * RTL: uses logical CSS properties throughout.
 */
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, X, Info } from '@ultranos/ui-kit/icons'
import { approveResult, rejectResult, holdResult } from '@/lib/authorization-actions'
import { canAuthorize, canReject, canHold, isCriticalResult } from '@/lib/permissions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import type { LabResult, LabObservation } from '@/lib/db'
import type { AbnormalityFlag } from '@/types/authorization'
import { AuthorizationStatus } from '@/types/authorization'
import type { RangeSnapshot, RangeSource } from '@/lib/reference-ranges/types'
import {
  SOURCE_BADGE_VARIANT,
  SOURCE_DISPLAY_LABEL,
} from '@/lib/reference-ranges/types'

interface ResultReviewPanelProps {
  result: LabResult
  observations: LabObservation[]
  onClose: () => void
  onActionComplete: (newStatus: AuthorizationStatus) => void
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant,
  requireComment,
  requireCheckbox,
  checkboxLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel: string
  confirmVariant: 'green' | 'red' | 'blue'
  requireComment?: boolean
  requireCheckbox?: boolean
  checkboxLabel?: string
  onConfirm: (comment: string, checked: boolean) => void
  onCancel: () => void
}) {
  const [comment, setComment] = useState('')
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')

  const variantClass = {
    green: 'bg-green-600 hover:bg-green-700 text-white',
    red: 'bg-amber-600 hover:bg-amber-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  }[confirmVariant]

  function handleConfirm() {
    if (requireComment && comment.trim().length === 0) {
      setError('A comment is required.')
      return
    }
    if (requireCheckbox && !checked) {
      setError('You must acknowledge the critical value.')
      return
    }
    onConfirm(comment, checked)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 id="confirm-dialog-title" className="text-lg font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        {requireCheckbox && checkboxLabel && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-red-300 accent-red-600"
            />
            <span>{checkboxLabel}</span>
          </label>
        )}

        {requireComment && (
          <textarea
            className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder={t('commentPlaceholder')}
            value={comment}
            onChange={(e) => { setComment(e.target.value); setError('') }}
            aria-label={t('commentAriaLabel')}
          />
        )}

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${variantClass}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Range source badge (matches ReferenceRangeEditor pattern)
// ---------------------------------------------------------------------------

const BADGE_CLASSES: Record<string, string> = {
  gray: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-amber-50 text-amber-700',
}

function RangeSourceBadge({ source }: { source: RangeSource }) {
  const variant = SOURCE_BADGE_VARIANT[source]
  const label = SOURCE_DISPLAY_LABEL[source]
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${BADGE_CLASSES[variant]}`}>
      {label}
    </span>
  )
}

/**
 * Extract the RangeSnapshot from an observation's _ultranos extension, if present.
 */
function getObsRangeSnapshot(obs: LabObservation): RangeSnapshot | undefined {
  return (obs as any)?._ultranos?.referenceRange as RangeSnapshot | undefined
}

type ActionDialogType = 'approve' | 'reject' | 'hold' | null

export function ResultReviewPanel({
  result,
  observations,
  onClose,
  onActionComplete,
}: ResultReviewPanelProps) {
  const t = useTranslations('authorization')
  const session = useAuthSessionStore((s) => s.session)
  const labRole = session?.labRole as LabRole | null
  const actorId = session?.userId ?? ''

  const [activeDialog, setActiveDialog] = useState<ActionDialogType>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Load current ranges for comparison with historical snapshots (AC #5)
  const [currentRanges, setCurrentRanges] = useState<Map<string, { rangeMin: number; rangeMax: number }>>(new Map())
  useEffect(() => {
    void (async () => {
      try {
        const { resolveLocalizedRange } = await import('@/lib/result-templates')
        const { getDb } = await import('@/lib/db')
        const db = getDb()
        const customRows = await db.table('referenceRanges').toArray()
        const active = customRows.filter((r: any) => !r.effectiveTo)
        const labSettings = await db.table('labSettings').get('config').catch(() => undefined) as { altitude?: number } | undefined
        const ctx = {
          patientAge: result.patientAge ?? 0,
          patientGender: 'unknown',
          labAltitude: labSettings?.altitude ?? 0,
          customRanges: active,
        }
        const map = new Map<string, { rangeMin: number; rangeMax: number }>()
        for (const obs of observations) {
          const snapshot = getObsRangeSnapshot(obs)
          if (snapshot) {
            const resolved = resolveLocalizedRange(obs.fieldCode, ctx)
            if (resolved) {
              map.set(obs.fieldCode, { rangeMin: resolved.rangeMin, rangeMax: resolved.rangeMax })
            }
          }
        }
        setCurrentRanges(map)
      } catch {
        // Range tables may not be available — no comparison possible
      }
    })()
  }, [observations, result.patientAge])

  const flags = (result.abnormalityFlags ?? []) as AbnormalityFlag[]
  const critical = isCriticalResult(flags)

  const canApprove = labRole
    ? canAuthorize(labRole, actorId, { id: result.id, enteredBy: result.enteredBy, abnormalityFlags: flags })
    : false
  const canRejectResult = labRole ? canReject(labRole) : false
  const canHoldResult = labRole ? canHold(labRole) : false

  async function handleApprove(comment: string, criticalAcknowledged: boolean) {
    setBusy(true)
    setActionError(null)
    try {
      await approveResult({
        result: result as any,
        actorId,
        actorRole: labRole ?? 'UNKNOWN',
        criticalValueAcknowledged: criticalAcknowledged,
      })
      onActionComplete(AuthorizationStatus.APPROVED)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to approve result.')
    } finally {
      setBusy(false)
      setActiveDialog(null)
    }
  }

  async function handleReject(comment: string) {
    setBusy(true)
    setActionError(null)
    try {
      await rejectResult({
        result: result as any,
        actorId,
        actorRole: labRole ?? 'UNKNOWN',
        rejectionComments: comment,
      })
      onActionComplete(AuthorizationStatus.REJECTED)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to reject result.')
    } finally {
      setBusy(false)
      setActiveDialog(null)
    }
  }

  async function handleHold(comment: string) {
    setBusy(true)
    setActionError(null)
    try {
      await holdResult({
        result: result as any,
        actorId,
        actorRole: labRole ?? 'UNKNOWN',
        holdComments: comment || undefined,
      })
      onActionComplete(AuthorizationStatus.HELD)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to hold result.')
    } finally {
      setBusy(false)
      setActiveDialog(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-panel-title"
    >
      {/* Overlay */}
      <div className="flex-1 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="flex h-full w-full max-w-2xl flex-col bg-card shadow-2xl overflow-hidden">
        {/* Critical value banner */}
        {critical && (
          <div
            className="flex items-center gap-3 bg-red-600 px-6 py-3 text-white"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle size={20} className="shrink-0" aria-hidden="true" />
            <span className="font-semibold">{t('criticalValueBanner')}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="review-panel-title" className="text-lg font-semibold text-foreground">
            {t('reviewPanelTitle')}
          </h2>
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            onClick={onClose}
            aria-label={t('closePanel')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Patient & meta */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('patientSection')}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('patientName')}</dt>
              <dd className="font-medium">{result.patientFirstName ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('patientAge')}</dt>
              <dd>{result.patientAge != null ? `${result.patientAge}y` : '—'}</dd>
              <dt className="text-muted-foreground">{t('testCategory')}</dt>
              <dd>{result.testCategory ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('loincCode')}</dt>
              <dd className="font-mono text-xs">{result.loincCode ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('enteredBy')}</dt>
              <dd className="font-mono text-xs">{result.enteredBy}</dd>
              <dt className="text-muted-foreground">{t('qcStatus')}</dt>
              <dd>
                <span className={`font-medium ${result.qcStatus === 'passing' ? 'text-green-600' : 'text-red-600'}`}>
                  {result.qcStatus ?? '—'}
                </span>
              </dd>
            </dl>
          </section>

          {/* Observation values */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('observationsSection')}
            </h3>
            {observations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noObservations')}</p>
            ) : (
              <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-start text-foreground">{t('fieldCode')}</th>
                    <th className="px-3 py-2 text-start text-foreground">{t('value')}</th>
                    <th className="px-3 py-2 text-start text-foreground">{t('flag')}</th>
                    <th className="px-3 py-2 text-start text-foreground">Range</th>
                    <th className="px-3 py-2 text-start text-foreground">{t('comment')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {observations.map((obs) => {
                    const criticalObs = obs.flag === 'LL' || obs.flag === 'HH'
                    const snapshot = getObsRangeSnapshot(obs)
                    const currentRange = currentRanges.get(obs.fieldCode)
                    const rangeChanged = snapshot && currentRange &&
                      (snapshot.rangeMin !== currentRange.rangeMin || snapshot.rangeMax !== currentRange.rangeMax)
                    return (
                      <tr key={obs.id} className={criticalObs ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 font-mono text-xs">{obs.fieldCode}</td>
                        <td className="px-3 py-2">{obs.value ?? '—'}</td>
                        <td className="px-3 py-2">
                          {obs.flag ? (
                            <span className={`font-semibold ${criticalObs ? 'text-red-700' : 'text-amber-700'}`}>
                              {obs.flag}
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs">Normal</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {snapshot ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-foreground">
                                {snapshot.rangeMin}–{snapshot.rangeMax}
                              </span>
                              <RangeSourceBadge source={snapshot.source} />
                              {rangeChanged && (
                                <span className="flex items-center gap-1 text-amber-600 mt-0.5">
                                  <Info size={12} aria-hidden="true" />
                                  <span>{t('rangeUpdated', { min: currentRange.rangeMin, max: currentRange.rangeMax })}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{obs.comment ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* Report comment */}
          {result.reportComment && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t('reportComment')}
              </h3>
              <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3 border border-border">
                {result.reportComment}
              </p>
            </section>
          )}

          {actionError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700" role="alert">
              {actionError}
            </p>
          )}
        </div>

        {/* Action footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3 bg-muted/30">
          <button
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
            disabled={!canHoldResult || busy}
            onClick={() => setActiveDialog('hold')}
          >
            {t('holdButton')}
          </button>
          <button
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
            disabled={!canRejectResult || busy}
            onClick={() => setActiveDialog('reject')}
          >
            {t('rejectButton')}
          </button>
          <button
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            disabled={!canApprove || busy}
            onClick={() => setActiveDialog('approve')}
          >
            {t('approveButton')}
          </button>
        </div>
      </div>

      {/* Confirmation dialogs */}
      {activeDialog === 'approve' && (
        <ConfirmDialog
          title={t('confirmApproveTitle')}
          description={t('confirmApproveDescription')}
          confirmLabel={t('confirmApproveButton')}
          confirmVariant="green"
          requireCheckbox={critical}
          checkboxLabel={critical ? t('criticalAcknowledgeCheckbox') : undefined}
          onConfirm={(_, checked) => handleApprove('', checked)}
          onCancel={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'reject' && (
        <ConfirmDialog
          title={t('confirmRejectTitle')}
          description={t('confirmRejectDescription')}
          confirmLabel={t('confirmRejectButton')}
          confirmVariant="red"
          requireComment
          onConfirm={(comment) => handleReject(comment)}
          onCancel={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'hold' && (
        <ConfirmDialog
          title={t('confirmHoldTitle')}
          description={t('confirmHoldDescription')}
          confirmLabel={t('confirmHoldButton')}
          confirmVariant="blue"
          onConfirm={(comment) => handleHold(comment)}
          onCancel={() => setActiveDialog(null)}
        />
      )}
    </div>
  )
}
