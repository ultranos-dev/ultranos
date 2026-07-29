'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileSearch, Package } from '@ultranos/ui-kit/icons'
import { db } from '@/lib/db'
import type { StockBatch, CatalogItem, StockBatchStatus } from '@/lib/inventory/types'

interface StockTableProps {
  filterStatus: 'all' | 'active' | 'quarantined' | 'depleted'
  filterLowStock: boolean
  filterNearExpiry: boolean
  search: string
  filtersActive: boolean
  onClearFilters: () => void
  expiryAlertDays?: number
}

interface StockRow {
  batch: StockBatch
  catalogItem: CatalogItem | undefined
}

export function StockTable({
  filterStatus,
  filterLowStock,
  filterNearExpiry,
  search,
  filtersActive,
  onClearFilters,
  expiryAlertDays = 90,
}: StockTableProps) {
  const t = useTranslations('inventory')
  const [rows, setRows] = useState<StockRow[]>([])

  useEffect(() => {
    async function load() {
      const [batches, items] = await Promise.all([
        db.stockBatches.toArray(),
        db.catalogItems.toArray(),
      ])
      const map = new Map(items.map((item) => [item.id, item]))
      setRows(batches.map((batch) => ({ batch, catalogItem: map.get(batch.catalogItemId) })))
    }
    load()
  }, [])

  const expiryThreshold = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + expiryAlertDays)
    return d.toISOString().split('T')[0] ?? ''
  }, [expiryAlertDays])

  const filtered = useMemo(() => {
    let result = rows

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter((r) => r.batch.status === filterStatus)
    }

    // Low stock filter
    if (filterLowStock) {
      result = result.filter((r) => {
        const item = r.catalogItem
        return item && r.batch.status === 'active' && r.batch.quantityOnHand <= item.reorderPoint
      })
    }

    // Near expiry filter
    if (filterNearExpiry) {
      result = result.filter(
        (r) => r.batch.status === 'active' && r.batch.expiryDate <= expiryThreshold
      )
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r) => {
        const name = r.catalogItem?.name?.toLowerCase() ?? ''
        const batch = r.batch.batchNumber.toLowerCase()
        return name.includes(q) || batch.includes(q)
      })
    }

    // Sort: active first, then by expiryDate ascending
    result.sort((a, b) => {
      const statusOrder: Record<StockBatchStatus, number> = { active: 0, quarantined: 1, depleted: 2 }
      const sDiff = statusOrder[a.batch.status] - statusOrder[b.batch.status]
      if (sDiff !== 0) return sDiff
      return a.batch.expiryDate.localeCompare(b.batch.expiryDate)
    })

    return result
  }, [rows, filterStatus, filterLowStock, filterNearExpiry, search, expiryThreshold])

  const isNearExpiry = (date: string) => date <= expiryThreshold

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
      {filtered.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <EmptyState
            icon={filtersActive ? FileSearch : Package}
            title={filtersActive ? t('noResultsTitle') : t('noStockBatches')}
            description={filtersActive ? t('noResultsDescription') : undefined}
            action={filtersActive ? { label: t('clearFilters'), onClick: onClearFilters } : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('productCol')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('batchCol')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('qtyCol')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('expiryCol')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('statusCol')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.batch.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {r.catalogItem?.name ?? t('unknown')}
                    </span>
                    {r.catalogItem?.controlledSchedule && (
                      <span className="ms-2 inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                        C{r.catalogItem.controlledSchedule}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.batch.batchNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.batch.quantityOnHand}</td>
                  <td
                    className={`px-4 py-3 ${
                      isNearExpiry(r.batch.expiryDate) && r.batch.status === 'active'
                        ? 'font-medium text-warning'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {r.batch.expiryDate}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.batch.status} tActive={t('active')} tDepleted={t('depleted')} tQuarantined={t('quarantined')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, tActive, tDepleted, tQuarantined }: { status: StockBatchStatus; tActive: string; tDepleted: string; tQuarantined: string }) {
  const classes: Record<StockBatchStatus, string> = {
    active: 'bg-success/10 text-success',
    quarantined: 'bg-destructive/10 text-destructive',
    depleted: 'bg-muted text-muted-foreground',
  }

  const labels: Record<StockBatchStatus, string> = {
    active: tActive,
    quarantined: tQuarantined,
    depleted: tDepleted,
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes[status]}`}
    >
      {labels[status]}
    </span>
  )
}
