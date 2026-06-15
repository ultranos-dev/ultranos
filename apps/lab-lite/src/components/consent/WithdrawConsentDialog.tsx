'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { withdrawConsent } from '@/lib/db'
import { reportConsentAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export interface WithdrawConsentDialogProps {
  consentId: number
  patientRef: string
  onWithdrawn: () => void
  onCancel: () => void
}

export function WithdrawConsentDialog({
  consentId,
  patientRef,
  onWithdrawn,
  onCancel,
}: WithdrawConsentDialogProps) {
  const t = useTranslations('consent')
  const session = useAuthSessionStore((s) => s.session)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    if (!reason.trim()) {
      setError(t('withdraw.reasonRequired'))
      return
    }
    setSubmitting(true)
    setError('')

    try {
      await withdrawConsent(consentId, reason.trim())

      reportConsentAuditEvent({
        action: 'CONSENT_REVOKE',
        consentRecordId: consentId,
        patientRef,
        reason: reason.trim(),
        technicianId: session?.userId,
      })

      onWithdrawn()
    } finally {
      setSubmitting(false)
    }
  }, [consentId, patientRef, reason, session, t, onWithdrawn])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 shadow-xl dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-red-600 dark:text-red-400">{t('withdraw.title')}</h2>

        <p className="mb-4 text-sm">{t('withdraw.confirm')}</p>

        <label className="block text-sm font-medium">
          {t('withdraw.reason')}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError('')
            }}
            placeholder={t('withdraw.reasonPlaceholder')}
            rows={3}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
          />
        </label>

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('common.cancel', { ns: 'common' })}
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? t('withdraw.submitting') : t('withdraw.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
