'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileSearch } from '@ultranos/ui-kit/icons'
import { db } from '@/lib/db'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { CatalogItem, StockMovement, StockMovementType } from '@/lib/inventory/types'

const MOVEMENT_TYPES: StockMovementType[] = [
  'received', 'dispensed', 'adjusted', 'transferred_out', 'transferred_in',
  'quarantined', 'disposed', 'returned', 'void_reversal', 'sold',
]

export function StockLedgerPage() {
  const t = useTranslations('inventory')
  const [moves, setMoves] = useState<StockMovement[]>([])
  const [items, setItems] = useState<Map<string, CatalogItem>>(new Map())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<StockMovementType | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    async function load() {
      const [m, cat] = await Promise.all([
        queryMovements({ type: typeFilter || undefined, from: from || undefined, to: to ? `${to}T23:59:59.999Z` : undefined, limit: 500 }),
        db.catalogItems.toArray(),
      ])
      setMoves(m)
      setItems(new Map(cat.map((c) => [c.id, c])))
    }
    load()
  }, [typeFilter, from, to])

  const filtered = useMemo(() => {
    if (!search.trim()) return moves
    const q = search.toLowerCase()
    return moves.filter((m) => (items.get(m.catalogItemId)?.name ?? '').toLowerCase().includes(q))
  }, [moves, search, items])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('ledgerTitle')}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ledgerSearchPlaceholder')}
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
        />
        <select data-testid="ledger-type-filter" value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as StockMovementType | '')}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
          <option value="">{t('ledgerTypeAll')}</option>
          {MOVEMENT_TYPES.map((mt) => <option key={mt} value={mt}>{t(`movement_${mt}`)}</option>)}
        </select>
        <input type="date" aria-label={t('ledgerFrom')} value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm" />
        <input type="date" aria-label={t('ledgerTo')} value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm" />
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={FileSearch} title={t('ledgerEmptyTitle')} description={t('ledgerEmptyDescription')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  {[t('ledgerTimeCol'), t('productCol'), t('batchCol'), t('ledgerTypeCol'), t('ledgerReasonCol'), t('ledgerQtyCol'), t('ledgerByCol')].map((h) => (
                    <th key={h} className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground font-numeric">{m.timestamp.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{items.get(m.catalogItemId)?.name ?? t('unknown')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.stockBatchId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t(`movement_${m.type}`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.reasonCode ? t(`reason_${m.reasonCode}`) : '—'}</td>
                    <td className={`px-4 py-3 font-numeric ${m.quantity < 0 ? 'text-destructive' : 'text-success'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
