'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb, type PaymentEntry } from '@/lib/db'
import { ReceiptView } from '@/components/finance/ReceiptView'

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
          className="self-start text-sm text-blue-600 hover:underline"
        >
          &larr; {t('title')}
        </button>
        <ReceiptView payment={selected} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {t('title')}
      </h1>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <button
              key={p.paymentId}
              type="button"
              onClick={() => setSelected(p)}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-start hover:bg-muted/30"
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
