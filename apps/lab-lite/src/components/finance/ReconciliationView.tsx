'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSyncStore } from '@/stores/sync-store'
import { getPaymentsByDate } from '@/lib/payment-service'
import { reportPaymentEvent } from '@/lib/audit-client'
import type { PaymentEntry, PaymentMethod } from '@/lib/db'

const VARIANCE_THRESHOLD = 500 // AFN

const formatAFN = (value: number) =>
  new Intl.NumberFormat('fa-AF', { style: 'currency', currency: 'AFN' }).format(value)

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ReconciliationView() {
  const t = useTranslations('finance.reconciliation')
  const session = useAuthSessionStore((s) => s.session)
  const syncPending = useSyncStore((s) => s.isPending)

  const [date, setDate] = useState(todayISO())
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getPaymentsByDate(date).then((p) => {
      if (active) {
        setPayments(p)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [date])

  const stats = useMemo(() => {
    const expectedTotal = payments.reduce(
      (sum, p) => sum + p.testsPayedFor.reduce((s, t) => s + t.price, 0),
      0,
    )
    const collectedTotal = payments.reduce((sum, p) => sum + p.amount, 0)
    const outstanding = payments.reduce((sum, p) => sum + p.outstandingBalance, 0)
    const variance = collectedTotal - expectedTotal

    const byMethod: Record<PaymentMethod, { count: number; total: number }> = {
      CASH: { count: 0, total: 0 },
      CARD: { count: 0, total: 0 },
      INSURANCE: { count: 0, total: 0 },
      WAIVER: { count: 0, total: 0 },
    }
    for (const p of payments) {
      byMethod[p.paymentMethod].count++
      byMethod[p.paymentMethod].total += p.amount
    }

    const waiverCount = byMethod.WAIVER.count

    return { expectedTotal, collectedTotal, outstanding, variance, byMethod, waiverCount }
  }, [payments])

  const handleCloseDay = useCallback(() => {
    void reportPaymentEvent({
      action: 'RECONCILIATION_VIEWED',
      paymentId: `recon-${date}`,
      cashierId: session?.practitionerId ?? session?.userId ?? 'unknown',
    })
  }, [date, session])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {syncPending && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {t('syncWarning')}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Card */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">{t('expectedTotal')}</span>
                <p className="text-lg font-bold text-foreground">{formatAFN(stats.expectedTotal)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('collectedTotal')}</span>
                <p className="text-lg font-bold text-foreground">{formatAFN(stats.collectedTotal)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('outstanding')}</span>
                <p className="text-lg font-bold text-amber-600">{formatAFN(stats.outstanding)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('variance')}</span>
                <p className={`text-lg font-bold ${stats.variance < 0 ? 'text-red-600' : 'text-foreground'}`}>
                  {formatAFN(stats.variance)}
                </p>
              </div>
            </div>
          </div>

          {/* Variance Warning */}
          {Math.abs(stats.variance) > VARIANCE_THRESHOLD && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {t('varianceWarning', { threshold: String(VARIANCE_THRESHOLD) })}
            </div>
          )}

          {/* Waiver Count */}
          {stats.waiverCount > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              {t('waiverCount', { count: String(stats.waiverCount) })}
            </div>
          )}

          {/* Breakdown by Method */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('byMethod')}</h2>
            <div className="space-y-2">
              {(Object.entries(stats.byMethod) as [PaymentMethod, { count: number; total: number }][])
                .filter(([, v]) => v.count > 0)
                .map(([method, v]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="text-foreground">
                      {method} ({t('methodCount', { count: String(v.count) })})
                    </span>
                    <span className="font-medium text-foreground">{formatAFN(v.total)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Transactions List */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('transactions')}</h2>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.paymentId} className="flex items-center justify-between rounded-md border border-border/50 p-2">
                  <div>
                    <span className="text-sm font-mono text-foreground">{p.receiptNumber}</span>
                    <span className="ms-2 text-xs text-muted-foreground">{p.paymentMethod}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{formatAFN(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Close Day */}
          <Button variant="outline" fullWidth onClick={handleCloseDay}>
            {t('closeDay')}
          </Button>
        </div>
      )}
    </div>
  )
}
