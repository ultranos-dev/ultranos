import { db } from '@/lib/db'

export interface ControlledDiscrepancy {
  countId: string
  countDate: string
  catalogItemName: string
  schedule: string
  expectedQty: number
  actualQty: number
  variance: number
}

export async function getControlledDiscrepancies(limit = 50): Promise<ControlledDiscrepancy[]> {
  const movements = await db.stockMovements
    .where('type').equals('adjusted')
    .filter((m) => m.reason?.startsWith('[CONTROLLED]') ?? false)
    .reverse()
    .sortBy('timestamp')
  const results: ControlledDiscrepancy[] = []
  for (const m of movements.slice(0, limit)) {
    const catalogItem = await db.catalogItems.get(m.catalogItemId)
    const match = m.reason?.match(/expected (\d+), counted (\d+)/)
    const expectedQty = match ? parseInt(match[1]!) : 0
    const actualQty = match ? parseInt(match[2]!) : 0
    results.push({
      countId: m.referenceId ?? '',
      countDate: m.timestamp,
      catalogItemName: catalogItem?.name ?? 'Unknown',
      schedule: catalogItem?.controlledSchedule ?? '',
      expectedQty,
      actualQty,
      variance: m.quantity,
    })
  }
  return results
}
