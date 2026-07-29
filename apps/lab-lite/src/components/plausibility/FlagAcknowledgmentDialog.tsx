'use client'

/**
 * Flag Acknowledgment Dialog
 * Story 43.5 — Task 7
 *
 * Modal dialog for acknowledging a plausibility flag.
 * Requires a minimum 10-character clinical explanation.
 * Stores acknowledgment record to Dexie (explanationLength only — not the text).
 * Emits PLAUSIBILITY_FLAG_ACKNOWLEDGED audit event.
 * RTL-aware layout (Arabic, Dari, Pashto).
 */

import { useState, useId } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { reportPlausibilityEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { PlausibilityFlag, FlagAcknowledgment } from '@/lib/plausibility/types'

const MIN_EXPLANATION_LENGTH = 10

interface Props {
  flag: PlausibilityFlag
  resultId: string
  patientRef: string
  onConfirm: (updatedFlag: PlausibilityFlag) => void
  onCancel: () => void
}

export function FlagAcknowledgmentDialog({ flag, resultId, patientRef, onConfirm, onCancel }: Props) {
  const t = useTranslations('plausibility')
  const session = useAuthSessionStore((s) => s.session)
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const explanationId = useId()

  const isValid = explanation.trim().length >= MIN_EXPLANATION_LENGTH

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const acknowledgedBy = session?.userId ?? 'unknown'
      const acknowledgedAt = new Date().toISOString()

      const ack: FlagAcknowledgment = {
        flagId: flag.id,
        resultId,
        acknowledgedBy,
        acknowledgedAt,
        // Store character count only — never the explanation text (PHI-adjacent)
        explanationLength: explanation.trim().length,
        hlcTimestamp: serializeHlc(hlc.now()),
      }

      await db.addFlagAcknowledgment(ack)

      // Audit: PLAUSIBILITY_FLAG_ACKNOWLEDGED — no explanation text, length only
      reportPlausibilityEvent({
        event: 'PLAUSIBILITY_FLAG_ACKNOWLEDGED',
        flagId: flag.id,
        resultId,
        patientRef,
        loincCode: flag.loincCode.split('+')[0] ?? flag.loincCode,
        ruleType: flag.ruleType,
        severity: flag.severity,
        explanationLength: explanation.trim().length,
        technicianId: acknowledgedBy,
      })

      onConfirm({ ...flag, acknowledged: true })
    } catch {
      setError('Failed to save acknowledgment. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <h2
            id="ack-dialog-title"
            className="text-base font-semibold text-foreground"
          >
            {t('dialogTitle')}
          </h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('dialogDescription')}
          </p>

          {/* Flag summary */}
          <div className="rounded border border-border bg-muted px-3 py-2 text-sm">
            <div className="flex gap-2">
              <span className="font-medium text-foreground">
                {t('dialogAnalyte')}:
              </span>
              <span className="text-foreground">{flag.analyte}</span>
            </div>
            <div className="mt-1 flex gap-2">
              <span className="font-medium text-foreground">
                {t('dialogFlag')}:
              </span>
              <span
                className={
                  flag.severity === 'CRITICAL'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                {flag.message}
              </span>
            </div>
          </div>

          {/* Explanation input */}
          <div>
            <label
              htmlFor={explanationId}
              className="block text-sm font-medium text-foreground"
            >
              {t('dialogExplanationLabel')}
            </label>
            <textarea
              id={explanationId}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={t('dialogExplanationPlaceholder')}
              rows={3}
              disabled={submitting}
              className="mt-1 block w-full rounded border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 dark:placeholder:text-muted-foreground"
            />
            {explanation.length > 0 && !isValid && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {t('dialogExplanationMinLength')}
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50"
            >
              {t('dialogCancel')}
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary"
            >
              {submitting ? '…' : t('dialogSubmit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
