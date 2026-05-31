import type { WasteAlert } from '@/types/waste-tracking'
import { FillLevel } from '@/types/waste-tracking'
import { getActiveContainers } from '@/lib/db'
import { calculateAverageFillDays } from './waste-tracking-service'

/** Threshold for time-based alert (fraction of average fill days). */
const TIME_THRESHOLD = 0.8

/** Hours without a fill-level check before generating a "not checked" alert. */
const STALE_CHECK_HOURS = 48

/** Evaluate all active containers and return alerts that need attention. */
export async function checkWasteAlerts(): Promise<WasteAlert[]> {
  const active = await getActiveContainers()
  const alerts: WasteAlert[] = []
  const now = Date.now()

  for (const container of active) {
    const avgFillDays = await calculateAverageFillDays(
      container.location,
      container.type,
    )
    const daysActive = (now - new Date(container.startDate).getTime()) / (1000 * 60 * 60 * 24)

    // Alert: container at 75%+ fill level
    if (
      container.fillLevel === FillLevel.THREE_QUARTER ||
      container.fillLevel === FillLevel.FULL
    ) {
      alerts.push({
        containerId: container.id,
        location: container.location,
        type: container.type,
        severity: container.fillLevel === FillLevel.FULL ? 'URGENT' : 'WARNING',
        message: `${container.type} container in ${container.location} is at ${container.fillLevel === FillLevel.FULL ? '100%' : '75%'} fill. Replace now.`,
        generatedAt: new Date().toISOString(),
      })
    }

    // Alert: container exceeding average fill time
    if (daysActive >= avgFillDays * TIME_THRESHOLD) {
      const severity = daysActive >= avgFillDays ? 'URGENT' : 'WARNING'
      alerts.push({
        containerId: container.id,
        location: container.location,
        type: container.type,
        severity,
        message: `${container.type} container in ${container.location} started ${Math.floor(daysActive)} days ago \u2014 average fill time is ${avgFillDays} days. ${severity === 'URGENT' ? 'Replace today.' : 'Consider replacement.'}`,
        generatedAt: new Date().toISOString(),
      })
    }

    // Alert: container not checked in 48+ hours
    const lastCheck =
      container.fillHistory.length > 0
        ? new Date(container.fillHistory[container.fillHistory.length - 1].recordedAt).getTime()
        : new Date(container.startDate).getTime()
    const hoursSinceCheck = (now - lastCheck) / (1000 * 60 * 60)

    if (hoursSinceCheck >= STALE_CHECK_HOURS) {
      alerts.push({
        containerId: container.id,
        location: container.location,
        type: container.type,
        severity: 'WARNING',
        message: `${container.type} container in ${container.location} has not been checked in ${Math.floor(hoursSinceCheck)} hours.`,
        generatedAt: new Date().toISOString(),
      })
    }
  }

  return alerts
}
