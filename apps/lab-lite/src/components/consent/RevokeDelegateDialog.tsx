'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { revokeDelegate } from '@/lib/db'
import { reportDelegateAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export interface RevokeDelegateDialogProps {
  delegateId: number
  patientRef: string
  delegateRelationship: string
  onRevoked: () => void
  onCancel: () => void
}

export function RevokeDelegateDialog({
  delegateId,
  patientRef,
  delegateRelationship,
  onRevoked,
  onCancel,
}: RevokeDelegateDialogProps) {
  const t = useTranslations('delegates')
  const session = useAuthSessionStore((s) => s.session)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleRevoke = useCallback(async () => {
    if (!reason.trim()) {
      setError(t('revokeReasonRequired'))
      return
    }
    setSubmitting(true)
    setError('')

    try {
      await revokeDelegate(delegateId, reason.trim())

      reportDelegateAuditEvent({
        action: 'DELEGATE_REVOKED',
        delegateId,
        patientRef,
        delegateRelationship,
        reason: reason.trim(),
        technicianId: session?.userId,
      })

      onRevoked()
    } finally {
      setSubmitting(false)
    }
  }, [delegateId, patientRef, delegateRelationship, reason, session, t, onRevoked])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-dialog-title"
    >
      <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 shadow-xl dark:bg-card">
        <h2
          id="revoke-dialog-title"
          className="mb-4 text-lg font-semibold text-red-600 dark:text-red-400"
        >
          {t('revokeDelegate')}
        </h2>

        <p className="mb-4 text-sm text-foreground dark:text-muted-foreground">
          {t('revokeConfirm')}
        </p>

        <label className="block text-sm font-medium text-foreground dark:text-muted-foreground">
          {t('revokeReason')}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError('')
            }}
            placeholder={t('revokeReasonPlaceholder')}
            rows={3}
            disabled={submitting}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 dark:border-border dark:bg-muted"
          />
        </label>

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted/30 disabled:opacity-50 dark:border-border dark:hover:bg-muted"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? t('revokeSubmitting') : t('revokeSubmit')}
          </button>
        </div>
      </div>
    </div>
  )
}
