'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb, type PaymentEntry } from '@/lib/db'
import { ReceiptView } from '@/components/finance/ReceiptView'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Receipt } from '@ultranos/ui-kit/icons'

export default function ReceiptsPage() {
  const t = useTranslations('finance.receipt')
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [selected, setSelected] = useState<PaymentEntry | null>(null)

  useEffect(() => {
    async function load() {
      const db = getDb()
      const all = await db.payments.orderBy('createdAt').reverse().toArray()
      setPayments(all)
    }
    load()
  }, [])

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start text-sm text-primary hover:underline"
        >
          &larr; {t('title')}
        </button>
        <ReceiptView payment={selected} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>

      {payments.length === 0 ? (
        <div className="flex min-h-[18rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState icon={Receipt} title={t('empty')} description={t('emptyHint')} />
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {payments.map((p) => (
            <button
              key={p.paymentId}
              type="button"
              onClick={() => setSelected(p)}
              className="flex w-full items-center justify-between p-3 text-start hover:bg-muted/30"
            >
              <div>
                <span className="text-sm font-medium text-foreground">{p.receiptNumber}</span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground">
                {new Intl.NumberFormat('fa-AF', { style: 'currency', currency: 'AFN' }).format(p.amount)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
