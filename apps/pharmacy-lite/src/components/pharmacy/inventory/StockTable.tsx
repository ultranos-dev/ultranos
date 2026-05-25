'use client'

import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/db'
import type { StockBatch, CatalogItem, StockBatchStatus } from '@/lib/inventory/types'

interface StockTableProps {
  filterStatus: 'all' | 'active' | 'quarantined' | 'depleted'
  filterLowStock: boolean
  filterNearExpiry: boolean
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
  expiryAlertDays = 90,
}: StockTableProps) {
  const [rows, setRows] = useState<StockRow[]>([])
  const [catalogMap, setCatalogMap] = useState<Map<string, CatalogItem>>(new Map())
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const [batches, items] = await Promise.all([
        db.stockBatches.toArray(),
        db.catalogItems.toArray(),
      ])
      const map = new Map(items.map((item) => [item.id, item]))
      setCatalogMap(map)
      setRows(batches.map((batch) => ({ batch, catalogItem: map.get(batch.catalogItemId) })))
    }
    load()
  }, [])

  const expiryThreshold = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + expiryAlertDays)
    return d.toISOString().split('T')[0]
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
    <div className="space-y-4">
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or batch number..."
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                Product
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                Batch
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                Qty
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                Expiry
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  No stock batches found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.batch.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-neutral-900">
                      {r.catalogItem?.name ?? 'Unknown'}
                    </span>
                    {r.catalogItem?.controlledSchedule && (
                      <span className="ms-2 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        C{r.catalogItem.controlledSchedule}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{r.batch.batchNumber}</td>
                  <td className="px-4 py-3 text-neutral-600">{r.batch.quantityOnHand}</td>
                  <td
                    className={`px-4 py-3 ${
                      isNearExpiry(r.batch.expiryDate) && r.batch.status === 'active'
                        ? 'font-medium text-amber-600'
                        : 'text-neutral-600'
                    }`}
                  >
                    {r.batch.expiryDate}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.batch.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: StockBatchStatus }) {
  const classes: Record<StockBatchStatus, string> = {
    active: 'bg-green-100 text-green-700',
    quarantined: 'bg-red-100 text-red-700',
    depleted: 'bg-neutral-100 text-neutral-500',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${classes[status]}`}
    >
      {status}
    </span>
  )
}
