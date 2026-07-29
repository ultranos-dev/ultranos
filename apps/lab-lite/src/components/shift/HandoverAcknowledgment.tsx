'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { acknowledgeHandover } from '@/lib/handover-service'
import type { HandoverReport } from '@/lib/db'

interface HandoverAcknowledgmentProps {
  report: HandoverReport
  incomingTechId: string
  incomingTechName: string
  onAcknowledged: () => void
}

/**
 * Sticky banner shown to an incoming tech with a pending handover.
 * Cannot be dismissed without acknowledgment (AC 3).
 */
export function HandoverAcknowledgment({
  report,
  incomingTechId,
  incomingTechName,
  onAcknowledged,
}: HandoverAcknowledgmentProps) {
  const t = useTranslations('shift')
  const [isExpanded, setIsExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingTotal = report.pendingSamples.stat + report.pendingSamples.routine
  const handoverTime = new Date(report.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  async function handleAcknowledge() {
    setIsSubmitting(true)
    setError(null)
    try {
      await acknowledgeHandover(report.id, incomingTechId, incomingTechName, notes || undefined)
      onAcknowledged()
    } catch {
      setError('Failed to acknowledge handover. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-40 border-b border-amber-300 bg-amber-50"
    >
      {/* Collapsed summary bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          <p className="text-sm font-medium text-amber-900">
            {t('handoverReportTitle')}: {report.outgoingTechName} at {handoverTime}
            {' — '}
            {pendingTotal} pending sample{pendingTotal !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="text-sm font-medium text-amber-700 underline hover:text-amber-900"
          aria-expanded={isExpanded}
        >
          {isExpanded ? t('hideDetails') : t('viewDetails')}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-amber-200 px-4 pb-4">
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Pending Samples */}
            <div className="rounded-md border border-amber-200 bg-card p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('pendingSamplesLabel')}
              </h4>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-red-600">{report.pendingSamples.stat}</p>
                  <p className="text-xs text-muted-foreground">{t('statLabel')}</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-600">{report.pendingSamples.routine}</p>
                  <p className="text-xs text-muted-foreground">{t('routineLabel')}</p>
                </div>
              </div>
            </div>

            {/* Equipment Alerts */}
            <div className="rounded-md border border-amber-200 bg-card p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('equipmentAlertsLabel')}
              </h4>
              {report.equipmentAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noneLabel')}</p>
              ) : (
                <ul className="space-y-1">
                  {report.equipmentAlerts.map((a) => (
                    <li key={a.instrumentId} className="text-sm text-red-700">
                      {a.instrumentName} — {a.alertType}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* QC Status */}
            {report.qcStatus.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-card p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('qcStatusLabel')}
                </h4>
                <ul className="space-y-1">
                  {report.qcStatus.map((q) => (
                    <li key={q.analyte} className="flex justify-between text-sm">
                      <span>{q.analyte}</span>
                      <span
                        className={
                          q.status === 'PASS'
                            ? 'font-medium text-green-600'
                            : q.status === 'FAIL'
                              ? 'font-medium text-red-600'
                              : 'text-muted-foreground'
                        }
                      >
                        {q.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Incomplete Orders */}
            <div className="rounded-md border border-amber-200 bg-card p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('incompleteOrdersLabel')}
              </h4>
              <p className="text-sm text-foreground">
                {report.incompleteOrders.length === 0
                  ? t('noneLabel')
                  : t('ordersAwaiting', { count: report.incompleteOrders.length })}
              </p>
            </div>
          </div>

          {/* Outgoing notes */}
          {report.outgoingNotes && (
            <div className="mt-4 rounded-md border border-amber-200 bg-card p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('notesLabel')} from {report.outgoingTechName}
              </h4>
              <p className="text-sm text-foreground">{report.outgoingNotes}</p>
            </div>
          )}

          {/* Incoming notes + acknowledge */}
          <div className="mt-4 space-y-3">
            <textarea
              aria-label="Your acknowledgment notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('incomingNotesPlaceholder')}
              className="w-full rounded-md border border-border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={isSubmitting}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {isSubmitting ? t('acknowledging') : t('acknowledgeHandover')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
