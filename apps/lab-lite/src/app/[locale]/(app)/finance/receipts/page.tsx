'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb, type PaymentEntry } from '@/lib/db'
import { ReceiptView } from '@/components/finance/ReceiptView'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { Receipt, FileSearch } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

export default function ReceiptsPage() {
  const t = useTranslations('finance.receipt')
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [selected, setSelected] = useState<PaymentEntry | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const db = getDb()
      const all = await db.payments.orderBy('createdAt').reverse().toArray()
      setPayments(all)
    }
    load()
  }, [])

  const query = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      query
        ? payments.filter((p) => (p.receiptNumber ?? '').toLowerCase().includes(query))
        : payments,
    [payments, query],
  )

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="w-fit px-0">
          &larr; {t('title')}
        </Button>
        <ReceiptView payment={selected} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>

      {/* Toolbar: search — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[18rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState
            icon={query ? FileSearch : Receipt}
            title={query ? t('noResults') : t('empty')}
            description={query ? undefined : t('emptyHint')}
          />
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {filtered.map((p) => (
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
              <span className="text-sm font-semibold text-foreground font-numeric">
                {new Intl.NumberFormat('fa-AF', { style: 'currency', currency: 'AFN' }).format(p.amount)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
