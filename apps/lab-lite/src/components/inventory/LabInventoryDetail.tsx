'use client'

/**
 * Story 52.2 — Shared Inventory Visibility: Per-Lab Inventory Detail View
 *
 * Shows the detailed inventory for a single lab with network comparison:
 * - All reagents, quantities, consumption rates, days of supply, expiry dates.
 * - Network comparison: this lab's daysOfSupply vs network min/max/average.
 * - Visual bar showing this lab's position relative to network.
 *
 * AC: 7 (percentile comparison), 8 (per-lab vs network toggle).
 *
 * RTL-ready: logical CSS only.
 * No PHI: reagent names and operational quantities only.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { NetworkInventoryEntry } from '@/lib/db'
import type { InventorySnapshotItem } from '@/lib/inventory/inventory-types'
import { getCellColor } from './NetworkInventoryHeatMap'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetworkStats {
  min: number
  max: number
  avg: number
  percentile: number    // 0–100: how this lab ranks (higher = more stock)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeNetworkStats(
  reagentCode: string,
  myDays: number,
  allEntries: NetworkInventoryEntry[],
): NetworkStats {
  const allValues = allEntries
    .flatMap(e => e.items)
    .filter(i => i.reagentCode === reagentCode)
    .map(i => i.daysOfSupply)

  if (allValues.length === 0) {
    return { min: myDays, max: myDays, avg: myDays, percentile: 50 }
  }

  const sorted = [...allValues].sort((a, b) => a - b)
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  const avg = Math.round(allValues.reduce((s, v) => s + v, 0) / allValues.length)
  const rank = sorted.filter(v => v < myDays).length
  const percentile = Math.round((rank / sorted.length) * 100)

  return { min, max, avg, percentile }
}

// Tailwind class for the supply level bar
function colorBarClass(days: number): string {
  if (days <= 7) return 'bg-red-500'
  if (days <= 30) return 'bg-yellow-400'
  return 'bg-green-500'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  labId: string
  labName: string
}

export function LabInventoryDetail({ labId, labName }: Props) {
  const t = useTranslations('inventory')

  const [myEntry, setMyEntry] = useState<NetworkInventoryEntry | null>(null)
  const [allEntries, setAllEntries] = useState<NetworkInventoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const all = await db.networkInventory.toArray()
      const mine = all.find(e => e.labId === labId) ?? null
      setAllEntries(all)
      setMyEntry(mine)
    } finally {
      setLoading(false)
    }
  }, [labId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (!myEntry) {
    return (
      <div className="rounded-lg border border-dashed border-border px-8 py-10 text-center text-sm text-muted-foreground">
        {t('noInventoryData')}
      </div>
    )
  }

  const sortedItems = [...myEntry.items].sort((a, b) =>
    a.reagentDisplay.localeCompare(b.reagentDisplay),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-foreground">{labName}</h2>
        <span className="text-xs text-muted-foreground">
          {t('lastSynced')}: {new Date(myEntry.snapshotAt).toLocaleString()}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                {t('reagent')}
              </th>
              <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                {t('qty')}
              </th>
              <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                {t('dailyRate')}
              </th>
              <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                {t('daysOfSupply')}
              </th>
              <th className="px-3 py-3 text-center font-medium text-muted-foreground">
                {t('expiry')}
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                {t('networkComparison')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {sortedItems.map((item: InventorySnapshotItem) => {
              const colorClass = getCellColor(item)
              const stats = computeNetworkStats(item.reagentCode, item.daysOfSupply, allEntries)

              const barFill = Math.min(
                100,
                item.daysOfSupply === 999
                  ? 100
                  : Math.round((item.daysOfSupply / Math.max(stats.max, 30)) * 100),
              )

              return (
                <tr key={item.reagentCode} className="hover:bg-muted">
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">{item.reagentDisplay}</div>
                    <div className="text-xs text-muted-foreground">{item.category}</div>
                  </td>
                  <td className="px-3 py-3 text-center text-foreground">
                    {item.currentQuantity}
                    <span className="text-xs text-muted-foreground"> {item.unitOfMeasure}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-foreground">
                    {item.dailyConsumptionRate.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        colorClass === 'green'
                          ? 'bg-green-100 text-green-800'
                          : colorClass === 'yellow'
                            ? 'bg-yellow-100 text-yellow-800'
                            : colorClass === 'red'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item.isStockedOut ? t('stockedOut') : `${item.daysOfSupply}d`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                    {item.expiryDate ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Bar */}
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${colorBarClass(item.daysOfSupply)}`}
                          style={{ width: `${barFill}%` }}
                          role="progressbar"
                          aria-valuenow={item.daysOfSupply}
                          aria-valuemin={0}
                          aria-valuemax={stats.max}
                        />
                      </div>
                      {/* Percentile label */}
                      <span className="text-xs text-muted-foreground">
                        {t('pctile', { pct: stats.percentile })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('networkAvg')}: {stats.avg}d
                    </p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
