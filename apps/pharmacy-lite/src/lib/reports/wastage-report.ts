import { db } from '@/lib/db'

export interface WastageMetrics {
  totalQuarantined: number
  totalDisposed: number
  quarantinedBatches: number
  disposedInPeriod: number
  wastageRate: number
}

export async function getWastageMetrics(daysBack: number): Promise<WastageMetrics> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString()
  const [quarantinedBatches, movements] = await Promise.all([
    db.stockBatches.where('status').equals('quarantined').count(),
    db.stockMovements.filter((m) => m.timestamp >= since).toArray(),
  ])
  let totalQuarantined = 0
  let totalDisposed = 0
  let totalMovements = 0
  for (const m of movements) {
    totalMovements++
    if (m.type === 'quarantined') totalQuarantined += Math.abs(m.quantity)
    if (m.type === 'disposed') totalDisposed += Math.abs(m.quantity)
  }
  const wasteMovements = movements.filter((m) => m.type === 'quarantined' || m.type === 'disposed').length
  const wastageRate = totalMovements > 0 ? Math.round((wasteMovements / totalMovements) * 100) : 0
  return { totalQuarantined, totalDisposed, quarantinedBatches, disposedInPeriod: movements.filter((m) => m.type === 'disposed').length, wastageRate }
}
