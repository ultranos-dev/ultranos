'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { recordHandoff } from '@/lib/sample-service'

/**
 * RecordHandoffModal — log a custody transfer between lab staff.
 * AC 5, 10. "From" is auto-populated with the current authenticated user.
 */
interface RecordHandoffModalProps {
  sampleId: string
  currentActorId: string
  onClose: () => void
  onSuccess: () => Promise<void>
}

export function RecordHandoffModal({
  sampleId,
  currentActorId,
  onClose,
  onSuccess,
}: RecordHandoffModalProps) {
  const t = useTranslations('samples')

  const [toActorId, setToActorId] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toActorId.trim()) {
      setError(t('validation.handoffToRequired'))
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await recordHandoff(sampleId, currentActorId, toActorId.trim(), notes || undefined)
      await onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.handoffFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="record-handoff-modal"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 id="handoff-modal-title" className="text-lg font-semibold text-neutral-900">
            {t('handoff.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modal.close')}
            className="rounded p-1 text-neutral-400 hover:text-neutral-600"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* From (read-only — current user) */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-700">
              {t('handoff.from')}
            </label>
            <p className="text-sm text-neutral-500 font-mono bg-neutral-50 rounded-lg px-3 py-2">
              {currentActorId}
            </p>
          </div>

          {/* To */}
          <div className="space-y-1">
            <label htmlFor="handoff-to" className="text-sm font-medium text-neutral-700">
              {t('handoff.to')}
            </label>
            <input
              id="handoff-to"
              type="text"
              value={toActorId}
              onChange={(e) => setToActorId(e.target.value)}
              placeholder={t('handoff.toPlaceholder')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="handoff-to-input"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="handoff-notes" className="text-sm font-medium text-neutral-700">
              {t('form.notes')}
            </label>
            <textarea
              id="handoff-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('handoff.notesPlaceholder')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              data-testid="handoff-notes-input"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600" data-testid="handoff-error">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              data-testid="handoff-submit-button"
            >
              {isSubmitting ? t('form.processing') : t('handoff.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
