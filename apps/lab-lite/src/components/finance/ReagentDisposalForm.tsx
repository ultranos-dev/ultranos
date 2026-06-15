'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { updateReagent, enqueueSyncEvent } from '@/lib/db'
import { ReagentStatus } from '@/lib/db'
import type { ReagentInventoryEntry, ReagentDisposalReason } from '@/lib/db'
import { reportReagentEvent } from '@/lib/audit-client'
import { hlc, serializeHlc } from '@/lib/hlc'
import { calculateFinancialLoss } from '@/lib/reagent-waste-service'

const DISPOSAL_STATUSES = [
  ReagentStatus.DEPLETED,
  ReagentStatus.EXPIRED,
  ReagentStatus.DISPOSED,
] as const

const DISPOSAL_REASONS: ReagentDisposalReason[] = [
  'depleted',
  'expired',
  'contaminated',
  'other',
]

interface ReagentDisposalFormProps {
  reagent: ReagentInventoryEntry
  onSuccess?: () => void
}

export function ReagentDisposalForm({ reagent, onSuccess }: ReagentDisposalFormProps) {
  const t = useTranslations('finance.reagent.disposal')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const today = new Date().toISOString().slice(0, 10)

  const autoRemaining = Math.max(0, reagent.expectedTests - reagent.testsPerformed)

  const [newStatus, setNewStatus] = useState<ReagentStatus>(ReagentStatus.DEPLETED)
  const [disposalReason, setDisposalReason] = useState<ReagentDisposalReason>('depleted')
  const [disposalNotes, setDisposalNotes] = useState('')
  const [remainingOverride, setRemainingOverride] = useState(String(autoRemaining))
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const remainingAtDisposal = parseInt(remainingOverride, 10) || 0
  const isWaste =
    newStatus !== ReagentStatus.DEPLETED && remainingAtDisposal > 0

  const financialLossPreview = isWaste
    ? calculateFinancialLoss([
        {
          ...reagent,
          status: newStatus,
          remainingAtDisposal,
        },
      ])
    : 0

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    if (!disposalReason) errs.push(t('errorReasonRequired'))
    const r = parseInt(remainingOverride, 10)
    if (isNaN(r) || r < 0) errs.push(t('errorRemainingNonNegative'))
    return errs
  }, [disposalReason, remainingOverride, t])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const errs = validate()
      if (errs.length > 0) {
        setErrors(errs)
        return
      }
      setErrors([])
      setSubmitting(true)

      try {
        const hlcTs = serializeHlc(hlc.now())
        const remaining = parseInt(remainingOverride, 10) || 0

        await updateReagent(reagent.reagentId, {
          status: newStatus,
          disposalDate: today,
          disposalReason,
          disposalNotes: disposalNotes.trim() || null,
          remainingAtDisposal: remaining,
          hlcTimestamp: hlcTs,
          syncStatus: 'pending',
        })

        await enqueueSyncEvent({
          resourceType: 'ReagentInventory',
          resourceId: reagent.reagentId,
          payload: {
            status: newStatus,
            disposalDate: today,
            disposalReason,
            remainingAtDisposal: remaining,
          },
          hlcTimestamp: hlcTs,
        })

        reportReagentEvent({
          action: 'REAGENT_DISPOSED',
          reagentId: reagent.reagentId,
          lotNumber: reagent.lotNumber,
          statusChange: `ACTIVE → ${newStatus}`,
          wasteAmount: remaining > 0 ? remaining : undefined,
          actorId: session?.userId,
        })

        onSuccess?.()
        router.push('/finance/reagents')
      } finally {
        setSubmitting(false)
      }
    },
    [
      validate,
      reagent,
      newStatus,
      disposalReason,
      disposalNotes,
      remainingOverride,
      today,
      session,
      onSuccess,
      router,
    ],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-sm text-gray-600">
        {t('reagentLabel')}: <strong>{reagent.name}</strong> — {t('lot')}: {reagent.lotNumber}
      </p>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1"
        >
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {/* New status */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="disposal-status">
          {t('newStatus')} <span aria-hidden>*</span>
        </label>
        <select
          id="disposal-status"
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as ReagentStatus)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {DISPOSAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s.toLowerCase()}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Disposal reason */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="disposal-reason">
          {t('reason')} <span aria-hidden>*</span>
        </label>
        <select
          id="disposal-reason"
          value={disposalReason}
          onChange={(e) => setDisposalReason(e.target.value as ReagentDisposalReason)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {DISPOSAL_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason.${r}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="disposal-notes">
          {t('notes')}
        </label>
        <textarea
          id="disposal-notes"
          value={disposalNotes}
          onChange={(e) => setDisposalNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Remaining at disposal (auto-calc, editable) */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="disposal-remaining">
          {t('remainingAtDisposal')}
        </label>
        <input
          id="disposal-remaining"
          type="number"
          min={0}
          value={remainingOverride}
          onChange={(e) => setRemainingOverride(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          {t('autoCalcNote', { calculated: autoRemaining })}
        </p>
      </div>

      {/* Waste warning + financial loss preview */}
      {isWaste && (
        <div
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <strong>{t('wasteWarning')}</strong>{' '}
          {t('financialLossPreview', {
            amount: financialLossPreview.toFixed(2),
            remaining: remainingAtDisposal,
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting} variant="danger">
          {submitting ? t('saving') : t('markDisposed')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
