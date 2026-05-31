import { ContainerType } from '@/types/waste-tracking'
import type { WasteSummary } from '@/types/waste-tracking'
import { getDisposalRecords, getAllContainers } from '@/lib/db'

/** Generate a monthly waste disposal summary for a given year/month. */
export async function generateMonthlySummary(
  year: number,
  month: number,
): Promise<WasteSummary> {
  // Use UTC dates to avoid timezone-dependent month boundaries
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString()
  const period = `${year}-${String(month).padStart(2, '0')}`

  const records = await getDisposalRecords({ start, end })

  const byType: Record<ContainerType, number> = {
    [ContainerType.SHARPS]: 0,
    [ContainerType.INFECTIOUS]: 0,
    [ContainerType.CHEMICAL]: 0,
  }

  const byLocation: Record<string, number> = {}

  for (const record of records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1
    byLocation[record.location] = (byLocation[record.location] ?? 0) + 1
  }

  // Calculate average fill days by type from containers disposed in this period
  const allContainers = await getAllContainers()
  const disposedInPeriod = allContainers.filter(
    (c) =>
      c.status === 'DISPOSED' &&
      c.fillDate !== null &&
      c.disposedAt != null &&
      c.disposedAt >= start &&
      c.disposedAt <= end,
  )

  const averageFillDaysByType: Record<ContainerType, number> = {
    [ContainerType.SHARPS]: 0,
    [ContainerType.INFECTIOUS]: 0,
    [ContainerType.CHEMICAL]: 0,
  }

  for (const type of Object.values(ContainerType)) {
    const ofType = disposedInPeriod.filter((c) => c.type === type)
    if (ofType.length === 0) continue
    const totalDays = ofType.reduce((sum, c) => {
      const s = new Date(c.startDate).getTime()
      const e = new Date(c.fillDate!).getTime()
      const days = (e - s) / (1000 * 60 * 60 * 24)
      return sum + Math.max(days, 0)
    }, 0)
    averageFillDaysByType[type] = Math.round(totalDays / ofType.length)
  }

  const complianceNotes: string[] = []
  if (records.length === 0) {
    complianceNotes.push('No disposal records for this period.')
  }

  return {
    period,
    totalContainersDisposed: records.length,
    byType,
    byLocation,
    averageFillDaysByType,
    complianceNotes,
  }
}
