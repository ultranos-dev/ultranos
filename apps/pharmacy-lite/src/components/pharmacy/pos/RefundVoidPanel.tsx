'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { voidSale, refundSale } from '@/lib/pos/refund-service'
import type { Invoice, PaymentMethod, RefundStockDisposition } from '@/lib/pos/types'
import { hlcNow } from '@/lib/hlc'

interface RefundVoidPanelProps {
  invoice: Invoice
  enableCredit: boolean
  onDone: () => void
}

type Mode = 'idle' | 'void' | 'refund'

/**
 * Story 62.1 (Task 2) — minimal viable void/refund UI on the POS page.
 * A void cancels the whole (same-day) sale; a refund returns money on an
 * already-settled sale. Both let the pharmacist choose stock disposition
 * (restock vs quarantine). Fully i18n'd. Full returns-management is future scope.
 */
export function RefundVoidPanel({ invoice, enableCredit, onDone }: RefundVoidPanelProps) {
  const t = useTranslations('pos')
  const session = useAuthSessionStore((s) => s.session)
  const [mode, setMode] = useState<Mode>('idle')
  const [reason, setReason] = useState('')
  const [disposition, setDisposition] = useState<RefundStockDisposition>('restock')
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadyClosed = invoice.status === 'voided' || invoice.status === 'refunded'
  if (alreadyClosed) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
        <p className="text-sm font-semibold text-destructive">
          {invoice.status === 'voided' ? t('voided') : t('refundedInFull')}
        </p>
      </div>
    )
  }

  const methods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: t('cash') },
    { value: 'card', label: t('card') },
    ...(enableCredit ? [{ value: 'credit' as PaymentMethod, label: t('credit') }] : []),
  ]

  const reset = () => {
    setMode('idle')
    setReason('')
    setDisposition('restock')
    setRefundMethod('cash')
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    if (!reason.trim()) {
      setError(t('reasonRequired'))
      return
    }
    if (!session) {
      setError(t('noActiveSession'))
      return
    }
    setSubmitting(true)
    try {
      const actor = `Practitioner/${session.practitionerId}`
      if (mode === 'void') {
        await voidSale({
          invoiceId: invoice.id,
          reason: reason.trim(),
          voidedBy: actor,
          hlcTimestamp: hlcNow(),
          stockDisposition: disposition,
        })
      } else {
        await refundSale({
          invoiceId: invoice.id,
          method: refundMethod,
          reason: reason.trim(),
          refundedBy: actor,
          hlcTimestamp: hlcNow(),
          stockDisposition: disposition,
          patientId: invoice.patientId,
        })
      }
      reset()
      onDone()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'void'
            ? t('voidFailed')
            : t('refundFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'idle') {
    return (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('void')}>
          {t('voidSale')}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setMode('refund')}>
          {t('refundSale')}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {mode === 'void' ? t('voidSaleTitle') : t('refundSaleTitle')}
      </h3>

      {/* Reason */}
      <div className="space-y-1">
        <label htmlFor="rv-reason" className="text-sm font-medium text-foreground">
          {t('reasonLabel')}
        </label>
        <textarea
          id="rv-reason"
          dir="auto"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          placeholder={t('reasonPlaceholder')}
        />
      </div>

      {/* Refund method (refund mode only) */}
      {mode === 'refund' && (
        <div className="space-y-1">
          <span className="text-sm font-medium text-foreground">{t('refundMethod')}</span>
          <div className="flex gap-2">
            {methods.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setRefundMethod(m.value)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  refundMethod === m.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-muted text-foreground hover:bg-accent'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stock disposition */}
      <div className="space-y-1">
        <span className="text-sm font-medium text-foreground">{t('stockDisposition')}</span>
        <div className="flex gap-2">
          {(['restock', 'quarantine'] as RefundStockDisposition[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                disposition === d
                  ? 'bg-primary-600 text-white'
                  : 'bg-muted text-foreground hover:bg-accent'
              }`}
            >
              {d === 'restock' ? t('restock') : t('quarantine')}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={reset} disabled={submitting}>
          {t('cancel')}
        </Button>
        <Button
          variant={mode === 'void' ? 'destructive' : 'default'}
          className="flex-1"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? t('processing')
            : mode === 'void'
              ? t('confirmVoid')
              : t('confirmRefund')}
        </Button>
      </div>
    </div>
  )
}
