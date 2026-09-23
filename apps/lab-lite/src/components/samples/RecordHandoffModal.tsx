'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { recordHandoff } from '@/lib/sample-service'
import { ModalHeader } from '@ultranos/ui-kit/components/ui/dialog'

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
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-card shadow-xl">
        <ModalHeader
          title={t('handoff.title')}
          titleId="handoff-modal-title"
          onClose={onClose}
          closeLabel={t('modal.close')}
        />

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* From (read-only — current user) */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              {t('handoff.from')}
            </label>
            <p className="text-sm text-muted-foreground font-mono bg-muted/30 rounded-lg px-3 py-2">
              {currentActorId}
            </p>
          </div>

          {/* To */}
          <div className="space-y-1">
            <label htmlFor="handoff-to" className="text-sm font-medium text-foreground">
              {t('handoff.to')}
            </label>
            <input
              id="handoff-to"
              type="text"
              value={toActorId}
              onChange={(e) => setToActorId(e.target.value)}
              placeholder={t('handoff.toPlaceholder')}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="handoff-to-input"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="handoff-notes" className="text-sm font-medium text-foreground">
              {t('form.notes')}
            </label>
            <textarea
              id="handoff-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('handoff.notesPlaceholder')}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring resize-none"
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
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 disabled:opacity-50"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
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
