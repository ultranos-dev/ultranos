'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  generateHandoverReport,
  finalizeHandover,
} from '@/lib/handover-service'
import type { HandoverReport } from '@/lib/db'

interface EndShiftDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirmed: () => void
}

type Step = 'preview' | 'confirm'

export function EndShiftDialog({ isOpen, onClose, onConfirmed }: EndShiftDialogProps) {
  const t = useTranslations('shift')
  const session = useAuthSessionStore((s) => s.session)

  const [step, setStep] = useState<Step>('preview')
  const [report, setReport] = useState<HandoverReport | null>(null)
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate report on open
  useEffect(() => {
    if (!isOpen || !session) return

    let active = true
    setIsLoading(true)
    setError(null)
    setStep('preview')
    setNotes('')
    setReport(null)

    const displayName = session.email?.split('@')[0] ?? 'Technician'

    generateHandoverReport(session.userId, displayName)
      .then((r) => {
        if (active) {
          setReport(r)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Failed to generate handover report. Please try again.')
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [isOpen, session])

  async function handleConfirm() {
    if (!report) return
    setIsSubmitting(true)
    setError(null)
    try {
      await finalizeHandover(report.id, notes)
      onConfirmed()
    } catch {
      setError('Failed to finalize handover. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-shift-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 id="end-shift-title" className="text-lg font-semibold text-foreground">
            {step === 'preview' ? t('endShiftDialogTitle') : t('endShiftConfirm')}
          </h2>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="ms-3 text-sm text-muted-foreground">{t('generatingReport')}</span>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!isLoading && !error && report && (
            <div className="space-y-4">
              {/* Pending Samples */}
              <section aria-labelledby="section-samples">
                <h3 id="section-samples" className="mb-2 text-sm font-medium text-foreground">
                  {t('pendingSamplesLabel')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-red-50 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">
                      {report.pendingSamples.stat}
                    </p>
                    <p className="text-xs text-red-600">{t('statLabel')}</p>
                  </div>
                  <div className="rounded-md bg-amber-50 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">
                      {report.pendingSamples.routine}
                    </p>
                    <p className="text-xs text-amber-600">{t('routineLabel')}</p>
                  </div>
                </div>
              </section>

              {/* Equipment Alerts */}
              {report.equipmentAlerts.length > 0 && (
                <section aria-labelledby="section-equipment">
                  <h3 id="section-equipment" className="mb-2 text-sm font-medium text-foreground">
                    {t('equipmentAlertsLabel')}
                  </h3>
                  <ul className="space-y-2">
                    {report.equipmentAlerts.map((alert) => (
                      <li
                        key={alert.instrumentId}
                        className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                      >
                        <span className="font-medium">{alert.instrumentName}</span>
                        <span className="text-red-600">— {alert.alertType}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* QC Status */}
              {report.qcStatus.length > 0 && (
                <section aria-labelledby="section-qc">
                  <h3 id="section-qc" className="mb-2 text-sm font-medium text-foreground">
                    {t('qcStatusLabel')}
                  </h3>
                  <ul className="space-y-1">
                    {report.qcStatus.map((qc) => (
                      <li key={qc.analyte} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{qc.analyte}</span>
                        <span
                          className={
                            qc.status === 'PASS'
                              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                              : qc.status === 'FAIL'
                                ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'
                                : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                          }
                        >
                          {qc.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Incomplete Orders */}
              <section aria-labelledby="section-orders">
                <h3 id="section-orders" className="mb-2 text-sm font-medium text-foreground">
                  {t('incompleteOrdersLabel')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {report.incompleteOrders.length === 0
                    ? t('noneLabel')
                    : t('ordersAwaiting', { count: report.incompleteOrders.length })}
                </p>
              </section>

              {/* Notes */}
              <section aria-labelledby="section-notes">
                <h3 id="section-notes" className="mb-2 text-sm font-medium text-foreground">
                  {t('notesLabel')}
                </h3>
                <textarea
                  aria-label={t('notesLabel')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={t('notesPlaceholder')}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 disabled:opacity-50"
          >
            {t('endShiftCancel')}
          </button>

          {!isLoading && !error && report && step === 'preview' && (
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('reviewAndConfirm')}
            </button>
          )}

          {step === 'confirm' && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? t('submittingHandover') : t('endShiftButton')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
