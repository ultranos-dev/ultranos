'use client'

import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/db'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useInventoryStore } from '@/stores/inventory-store'
import { getTotalStockOnHand } from '@/lib/inventory/fefo'
import type { CatalogItem } from '@/lib/inventory/types'

interface CatalogRowData {
  item: CatalogItem
  stockOnHand: number
}

export function CatalogBrowsePage() {
  useCatalogSync()
  const isSyncingCatalog = useInventoryStore((s) => s.isSyncingCatalog)

  const [rows, setRows] = useState<CatalogRowData[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const items = await db.catalogItems.toArray()
      const withStock = await Promise.all(
        items.map(async (item) => ({
          item,
          stockOnHand: await getTotalStockOnHand(item.id),
        }))
      )
      setRows(withStock)
    }
    load()
  }, [isSyncingCatalog])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => {
      const name = r.item.name.toLowerCase()
      const nameLocal = r.item.nameLocal?.toLowerCase() ?? ''
      const barcode = r.item.barcode?.toLowerCase() ?? ''
      const category = r.item.category.toLowerCase()
      return name.includes(q) || nameLocal.includes(q) || barcode.includes(q) || category.includes(q)
    })
  }, [rows, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Catalog</h1>
        {isSyncingCatalog && (
          <span className="text-sm text-neutral-500">Syncing...</span>
        )}
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, barcode, or category..."
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 px-4 py-12 text-center text-neutral-400">
          No catalog items found. Catalog syncs from Hub when online.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Name
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Form
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Strength
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Category
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Stock
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Reorder Point
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((r) => (
                <tr key={r.item.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-neutral-900">{r.item.name}</span>
                    {r.item.controlledSchedule && (
                      <span className="ms-2 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        C{r.item.controlledSchedule}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-600">{r.item.form}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {r.item.strength} {r.item.strengthUnit}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{r.item.category}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      r.stockOnHand <= r.item.reorderPoint
                        ? 'text-amber-600'
                        : 'text-neutral-900'
                    }`}
                  >
                    {r.stockOnHand}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{r.item.reorderPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
