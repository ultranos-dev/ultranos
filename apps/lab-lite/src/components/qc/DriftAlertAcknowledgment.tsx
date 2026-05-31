'use client'

/**
 * DriftAlertAcknowledgment — Story 43.6
 *
 * Modal dialog for acknowledging a drift alert with a mandatory resolution action.
 * The lab supervisor must select a resolution reason and can optionally add notes.
 *
 * RTL: Uses logical CSS properties throughout (ms-/me-, start/end).
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DriftAlert, DriftAlertResolution } from '@/lib/qc/types'
import { acknowledgeDriftAlert } from '@/lib/qc/drift-detector'
import { reportQcDriftEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface DriftAlertAcknowledgmentProps {
  alert: DriftAlert
  onComplete: () => void
  onCancel: () => void
}

const RESOLUTION_OPTIONS: { value: DriftAlertResolution; labelKey: string }[] = [
  { value: 'RECALIBRATED', labelKey: 'resolution.recalibrated' },
  { value: 'MAINTENANCE_PERFORMED', labelKey: 'resolution.maintenancePerformed' },
  { value: 'FALSE_ALARM_VERIFIED', labelKey: 'resolution.falseAlarmVerified' },
  { value: 'DEFERRED_TO_SUPERVISOR', labelKey: 'resolution.deferredToSupervisor' },
]

export function DriftAlertAcknowledgment({
  alert,
  onComplete,
  onCancel,
}: DriftAlertAcknowledgmentProps) {
  const t = useTranslations('qc')
  const session = useAuthSessionStore((s) => s.session)
  const [resolution, setResolution] = useState<DriftAlertResolution | ''>('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resolution) {
      setError(t('resolutionRequired'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const actorId = session?.userId ?? 'unknown'
      await acknowledgeDriftAlert(
        alert.id,
        actorId,
        resolution as DriftAlertResolution,
        notes.trim() || null,
      )

      // Emit QC_DRIFT_ACKNOWLEDGED audit event (CLAUDE.md Rule #6)
      reportQcDriftEvent({
        action: 'QC_DRIFT_ACKNOWLEDGED',
        alertId: alert.id,
        analyte: alert.analyte,
        instrumentId: alert.instrumentId,
        resolution: resolution as DriftAlertResolution,
        acknowledgedBy: actorId,
      })

      onComplete()
    } catch {
      setError(t('acknowledgeError'))
    } finally {
      setSubmitting(false)
    }
  }

  const isReject = alert.severity === 'REJECT'
  const severityColor = isReject ? 'text-red-700' : 'text-amber-700'
  const severityBadgeBg = isReject ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 id="ack-dialog-title" className="text-base font-semibold text-neutral-900">
            {t('acknowledgeAlertTitle')}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">{alert.analyte}</p>
        </div>

        {/* Alert summary */}
        <div className="px-5 py-4">
          <div className="mb-4 rounded-lg bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${severityBadgeBg}`}>
                {alert.severity}
              </span>
              <span className="text-xs text-neutral-500">{alert.ruleViolated}</span>
            </div>
            <p className={`mt-1.5 text-sm ${severityColor}`}>{alert.message}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Resolution selection — mandatory */}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-neutral-700">
                {t('resolutionActionLabel')}
                <span className="ms-1 text-red-500" aria-hidden="true">*</span>
              </legend>
              <div className="space-y-2">
                {RESOLUTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-200 p-2.5 hover:bg-neutral-50"
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value={opt.value}
                      checked={resolution === opt.value}
                      onChange={() => setResolution(opt.value)}
                      className="h-4 w-4 text-blue-600"
                      required
                    />
                    <span className="text-sm text-neutral-800">{t(opt.labelKey)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Notes — optional */}
            <div className="mt-4">
              <label
                htmlFor="ack-notes"
                className="mb-1.5 block text-sm font-medium text-neutral-700"
              >
                {t('notesLabel')}
                <span className="ms-1 text-xs font-normal text-neutral-400">
                  ({t('optional')})
                </span>
              </label>
              <textarea
                id="ack-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('notesPlaceholder')}
              />
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? t('acknowledging') : t('confirmAcknowledge')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
