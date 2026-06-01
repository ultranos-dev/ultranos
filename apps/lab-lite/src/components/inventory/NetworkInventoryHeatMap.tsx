'use client'

/**
 * Story 52.2 — Shared Inventory Visibility: Network Inventory Heat Map
 *
 * Renders a matrix view: labs as rows, reagent categories as columns.
 * Color coding:
 *   Green  → daysOfSupply > 30
 *   Yellow → 7 < daysOfSupply ≤ 30
 *   Red    → daysOfSupply ≤ 7 or isStockedOut
 *   Gray   → reagent not tracked at this lab
 *
 * RTL-ready: uses logical CSS properties (start/end, not left/right).
 * Responsive: stacks to vertical list on narrow viewports.
 * Offline-capable: renders from Dexie cache with staleness banner.
 *
 * CLAUDE.md Rule #6 — audit every data access (caller emits audit event).
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RefreshCw, WifiOff } from '@ultranos/ui-kit/icons'
import { getDb } from '@/lib/db'
import type { NetworkInventoryEntry } from '@/lib/db'
import type { InventorySnapshotItem } from '@/lib/inventory/inventory-types'
import { runInventorySync, getLastSyncTimestamp } from '@/lib/inventory/sync-worker'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HeatColor = 'green' | 'yellow' | 'red' | 'gray'

interface CellData {
  daysOfSupply: number
  currentQuantity: number
  isStockedOut: boolean
  dailyConsumptionRate: number
  expiryDate: string | null
}

interface HeatMapCell {
  color: HeatColor
  data: CellData | null  // null = not tracked
}

interface HeatMapRow {
  labId: string
  labName: string
  district: string
  snapshotAt: string
  cells: Record<string, HeatMapCell>  // keyed by category
  hasStockout: boolean
}

// ---------------------------------------------------------------------------
// Color logic
// ---------------------------------------------------------------------------

export function getCellColor(item: InventorySnapshotItem): HeatColor {
  if (item.isStockedOut || item.daysOfSupply <= 7) return 'red'
  if (item.daysOfSupply <= 30) return 'yellow'
  return 'green'
}

const COLOR_CLASSES: Record<HeatColor, string> = {
  green:  'bg-green-100 text-green-800 border-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  red:    'bg-red-100 text-red-800 border-red-200',
  gray:   'bg-gray-100 text-gray-400 border-gray-200',
}

const CATEGORIES = [
  'hematology',
  'chemistry',
  'microbiology',
  'rapid-tests',
  'urinalysis',
  'other',
] as const

// ---------------------------------------------------------------------------
// Drill-down modal data
// ---------------------------------------------------------------------------

interface DrillDownData {
  labName: string
  category: string
  item: CellData
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  myLabId: string
}

export function NetworkInventoryHeatMap({ myLabId }: Props) {
  const t = useTranslations('inventory')

  const [rows, setRows] = useState<HeatMapRow[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [drillDown, setDrillDown] = useState<DrillDownData | null>(null)
  const [isStale, setIsStale] = useState(false)

  // ---------------------------------------------------------------------------
  // Load from Dexie cache
  // ---------------------------------------------------------------------------

  const loadCache = useCallback(async () => {
    const db = getDb()
    const entries: NetworkInventoryEntry[] = await db.networkInventory.toArray()
    const lastSync = await getLastSyncTimestamp()
    setLastSyncedAt(lastSync)

    // Check staleness (>24h)
    if (lastSync) {
      const ageMs = Date.now() - new Date(lastSync).getTime()
      setIsStale(ageMs > 24 * 60 * 60 * 1000)
    }

    const heatRows: HeatMapRow[] = entries.map(entry => {
      const itemsByCategory = new Map<string, InventorySnapshotItem>()
      for (const item of entry.items) {
        // Keep worst item per category (lowest daysOfSupply)
        const existing = itemsByCategory.get(item.category)
        if (!existing || item.daysOfSupply < existing.daysOfSupply) {
          itemsByCategory.set(item.category, item)
        }
      }

      const cells: Record<string, HeatMapCell> = {}
      for (const cat of CATEGORIES) {
        const item = itemsByCategory.get(cat)
        if (!item) {
          cells[cat] = { color: 'gray', data: null }
        } else {
          cells[cat] = {
            color: getCellColor(item),
            data: {
              daysOfSupply: item.daysOfSupply,
              currentQuantity: item.currentQuantity,
              isStockedOut: item.isStockedOut,
              dailyConsumptionRate: item.dailyConsumptionRate,
              expiryDate: item.expiryDate,
            },
          }
        }
      }

      return {
        labId: entry.labId,
        labName: entry.labName,
        district: entry.district,
        snapshotAt: entry.snapshotAt,
        cells,
        hasStockout: entry.items.some(i => i.isStockedOut),
      }
    })

    // Sort: stockout labs first, then by name
    heatRows.sort((a, b) => {
      if (a.hasStockout !== b.hasStockout) return a.hasStockout ? -1 : 1
      return a.labName.localeCompare(b.labName)
    })

    setRows(heatRows)
  }, [])

  useEffect(() => {
    loadCache()
  }, [loadCache])

  // ---------------------------------------------------------------------------
  // Manual sync
  // ---------------------------------------------------------------------------

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true)
    try {
      await runInventorySync()
      await loadCache()
    } finally {
      setIsSyncing(false)
    }
  }, [loadCache])

  // ---------------------------------------------------------------------------
  // Stockout alert labs
  // ---------------------------------------------------------------------------

  const stockoutLabs = rows.filter(r => r.hasStockout)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Staleness warning */}
      {isStale && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>
            {t('networkDataMayBeOutdated')} {lastSyncedAt && `(${t('lastSynced')}: ${new Date(lastSyncedAt).toLocaleString()})`}
          </span>
        </div>
      )}

      {/* Stockout alert banner */}
      {stockoutLabs.length > 0 && (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3"
          role="alert"
        >
          <div className="flex items-center gap-2 font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span>{t('stockoutAlertTitle')}</span>
          </div>
          <ul className="mt-1 list-inside list-disc text-sm text-red-700">
            {stockoutLabs.map(lab => (
              <li key={lab.labId}>{lab.labName}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          {lastSyncedAt && !isStale && (
            <p className="text-xs text-gray-500">
              {t('lastSynced')}: {new Date(lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden />
          {isSyncing ? t('syncing') : t('syncNow')}
        </button>
      </div>

      {/* Heat map matrix */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-8 py-12 text-center text-sm text-gray-500">
          {t('noNetworkData')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-gray-600">
                  {t('lab')}
                </th>
                {CATEGORIES.map(cat => (
                  <th
                    key={cat}
                    className="px-3 py-3 text-center font-medium text-gray-600 capitalize"
                  >
                    {t(`category.${cat}`, { defaultValue: cat })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map(row => (
                <tr
                  key={row.labId}
                  className={row.labId === myLabId ? 'bg-blue-50' : ''}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {row.labName}
                    {row.labId === myLabId && (
                      <span className="ms-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {t('myLab')}
                      </span>
                    )}
                  </td>
                  {CATEGORIES.map(cat => {
                    const cell = row.cells[cat]!
                    return (
                      <td key={cat} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          className={`inline-flex h-10 w-full min-w-[80px] items-center justify-center rounded border px-2 text-xs font-medium transition-opacity hover:opacity-80 ${COLOR_CLASSES[cell.color]}`}
                          onClick={() =>
                            cell.data
                              ? setDrillDown({
                                  labName: row.labName,
                                  category: cat,
                                  item: cell.data,
                                })
                              : null
                          }
                          disabled={cell.data === null}
                          aria-label={
                            cell.data
                              ? `${row.labName} ${cat}: ${cell.data.daysOfSupply} days`
                              : `${row.labName} ${cat}: not tracked`
                          }
                        >
                          {cell.data === null
                            ? '—'
                            : cell.data.isStockedOut
                              ? t('stockedOut')
                              : `${cell.data.daysOfSupply}d`}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down detail panel */}
      {drillDown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDrillDown(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">
              {drillDown.labName} — {drillDown.category}
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">{t('daysOfSupply')}</dt>
                <dd className="font-medium text-gray-900">
                  {drillDown.item.isStockedOut
                    ? t('stockedOut')
                    : `${drillDown.item.daysOfSupply} ${t('days')}`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">{t('currentQuantity')}</dt>
                <dd className="font-medium text-gray-900">
                  {drillDown.item.currentQuantity}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">{t('dailyRate')}</dt>
                <dd className="font-medium text-gray-900">
                  {drillDown.item.dailyConsumptionRate.toFixed(1)} / {t('day')}
                </dd>
              </div>
              {drillDown.item.expiryDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('nearestExpiry')}</dt>
                  <dd className="font-medium text-gray-900">
                    {drillDown.item.expiryDate}
                  </dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
              onClick={() => setDrillDown(null)}
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        {(
          [
            ['green', t('legendGreen', { defaultValue: '>30 days' })],
            ['yellow', t('legendYellow', { defaultValue: '7–30 days' })],
            ['red', t('legendRed', { defaultValue: '<7 days / stockout' })],
            ['gray', t('legendGray', { defaultValue: 'Not tracked' })],
          ] as [HeatColor, string][]
        ).map(([color, label]) => (
          <span key={color} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded border ${COLOR_CLASSES[color]}`}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
