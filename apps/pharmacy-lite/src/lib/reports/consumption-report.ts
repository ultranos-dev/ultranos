import { db } from '@/lib/db'

export interface ConsumptionItem {
  catalogItemId: string
  catalogItemName: string
  totalDispensed: number
  category: string
}

export async function getTopDispensedItems(params: { daysBack: number; limit: number }): Promise<ConsumptionItem[]> {
  const since = new Date(Date.now() - params.daysBack * 86400000).toISOString()
  const movements = await db.stockMovements.where('type').equals('dispensed').filter((m) => m.timestamp >= since).toArray()
  const totals = new Map<string, number>()
  for (const m of movements) { totals.set(m.catalogItemId, (totals.get(m.catalogItemId) ?? 0) + Math.abs(m.quantity)) }
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, params.limit)
  const catalogIds = sorted.map(([id]) => id)
  const catalogItems = catalogIds.length > 0 ? await db.catalogItems.where('id').anyOf(catalogIds).toArray() : []
  const catalogMap = new Map(catalogItems.map((c) => [c.id, c]))
  return sorted.map(([id, total]) => ({
    catalogItemId: id,
    catalogItemName: catalogMap.get(id)?.name ?? 'Unknown',
    totalDispensed: total,
    category: catalogMap.get(id)?.category ?? '',
  }))
}

export async function getDailyDispensingTotals(daysBack: number): Promise<{ date: string; count: number }[]> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()
  const movements = await db.stockMovements.where('type').equals('dispensed').filter((m) => m.timestamp >= since).toArray()
  const dailyMap = new Map<string, number>()
  for (const m of movements) { const date = m.timestamp.split('T')[0]!; dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1) }
  const results: { date: string; count: number }[] = []
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]!
    results.push({ date, count: dailyMap.get(date) ?? 0 })
  }
  return results
}
