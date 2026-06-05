'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { updateSendOutStatus } from '@/lib/sendout-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { SendOut, SendOutStatus } from '@/types/reference-lab'
import { SENDOUT_ALLOWED_TRANSITIONS } from '@/types/reference-lab'

interface StatusUpdateModalProps {
  sendOut: SendOut
  onClose: () => void
  onSuccess: () => void
}

// STATUS_LABELS moved into component to use translations — see below

const PIPELINE_STEPS: SendOutStatus[] = ['sent', 'received', 'processing', 'results-available']

export function StatusUpdateModal({ sendOut, onClose, onSuccess }: StatusUpdateModalProps) {
  const t = useTranslations('sendout')
  const session = useAuthSessionStore((s) => s.session)

  const STATUS_LABELS: Record<SendOutStatus, string> = {
    sent: t('statusLabelSent'),
    received: t('statusLabelReceived'),
    processing: t('statusLabelProcessing'),
    'results-available': t('statusLabelResultsAvailable'),
    cancelled: t('statusLabelCancelled'),
  }
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowedNext = SENDOUT_ALLOWED_TRANSITIONS[sendOut.status].filter(
    (s) => s !== 'cancelled',
  )
  const nextStatus = allowedNext[0] ?? null

  async function handleAdvance() {
    if (!nextStatus || !session?.userId) return
    setLoading(true)
    setError(null)
    try {
      await updateSendOutStatus(sendOut.id, nextStatus, 'manual', session.userId, notes || undefined)
      onSuccess()
    } catch {
      setError(t('statusUpdateError'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!session?.userId) return
    setLoading(true)
    setError(null)
    try {
      await updateSendOutStatus(sendOut.id, 'cancelled', 'manual', session.userId, notes || undefined)
      onSuccess()
    } catch {
      setError(t('statusCancelError'))
    } finally {
      setLoading(false)
    }
  }

  const currentStepIndex = PIPELINE_STEPS.indexOf(sendOut.status as SendOutStatus)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="status-modal-title" className="text-base font-semibold text-foreground">
            {t('statusModalTitle')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('statusCloseAriaLabel')} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Pipeline visualizer */}
          <div>
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">{t('statusPipelineLabel')}</p>
            <ol className="flex items-center gap-1" role="list">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = i < currentStepIndex
                const isCurrent = i === currentStepIndex
                return (
                  <li key={step} className="flex items-center gap-1 flex-1">
                    <div
                      className={`flex-1 rounded px-2 py-1.5 text-center text-xs font-medium ${
                        isDone
                          ? 'bg-green-100 text-green-700'
                          : isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {STATUS_LABELS[step]}
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <DirectionalIcon category="navigation">
                        <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                      </DirectionalIcon>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Notes field */}
          <div>
            <label htmlFor="status-notes" className="block text-sm font-medium text-foreground mb-1">
              {t('statusNotesLabel')} <span className="text-muted-foreground font-normal">{t('statusNotesOptional')}</span>
            </label>
            <textarea
              id="status-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('statusNotesPlaceholder')}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading || sendOut.status === 'cancelled'}
              className="text-sm text-red-600 underline disabled:opacity-40"
            >
              {t('statusCancelSendOut')}
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30">
                {t('statusCloseButton')}
              </button>
              {nextStatus && (
                <button
                  type="button"
                  onClick={handleAdvance}
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? t('statusUpdatingButton') : t('statusMarkAsButton', { status: STATUS_LABELS[nextStatus] })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
