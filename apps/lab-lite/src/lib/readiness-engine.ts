/**
 * Pre-Shift Readiness Forecast Engine — Story 48.3
 *
 * Evaluates five operational dimensions to generate a morning briefing.
 * All computation runs against local Dexie data — fully offline.
 * No PHI: operational data only (reagent names, order counts, power window times).
 * CLAUDE.md Rule #7: pending orders show COUNT only, never patient names/IDs.
 */

import { getActiveReagents, getOrders, ReagentStatus } from '@/lib/db'
import { calculatePowerBudget } from '@/lib/workload-scheduler'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadinessDimension = 'personnel' | 'reagents' | 'equipment' | 'pendingOrders' | 'power'

export type RAGStatus = 'green' | 'amber' | 'red'

export interface DimensionResult {
  dimension: ReadinessDimension
  status: RAGStatus
  /** i18n key for the dimension title */
  titleKey: string
  /** i18n key for the one-line summary */
  summaryKey: string
  /** i18n key args for the summary (interpolated values) */
  summaryArgs?: Record<string, string | number>
  /** Array of i18n keys for detail lines */
  details: string[]
  /** Array of i18n keys for actionable recommendations */
  recommendations: string[]
  /** Context data for recommendation interpolation */
  recommendationArgs?: Array<Record<string, string | number>>
}

export interface ReadinessBriefing {
  dimensions: DimensionResult[]
  overallStatus: RAGStatus
  /** ISO 8601 timestamp */
  generatedAt: string
  refreshable: boolean
}

// ---------------------------------------------------------------------------
// Helper: worst RAG wins
// ---------------------------------------------------------------------------

function worstStatus(statuses: RAGStatus[]): RAGStatus {
  if (statuses.includes('red')) return 'red'
  if (statuses.includes('amber')) return 'amber'
  return 'green'
}

// ---------------------------------------------------------------------------
// Helper: days until expiry
// ---------------------------------------------------------------------------

function daysUntilDate(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Dimension 1: Personnel
// ---------------------------------------------------------------------------

export async function evaluatePersonnel(): Promise<DimensionResult> {
  // MVP: check if a user session is active.
  // Auth session is managed in-memory by Zustand store — works offline.
  const session = useAuthSessionStore.getState().session

  if (!session) {
    return {
      dimension: 'personnel',
      status: 'red',
      titleKey: 'readiness.dimensions.personnel.title',
      summaryKey: 'readiness.dimensions.personnel.summaryNoUser',
      details: [],
      recommendations: ['readiness.recommendations.personnelRed'],
      recommendationArgs: [{}],
    }
  }

  // No roster data configured yet — amber with setup prompt
  return {
    dimension: 'personnel',
    status: 'amber',
    titleKey: 'readiness.dimensions.personnel.title',
    summaryKey: 'readiness.dimensions.personnel.summaryLoggedIn',
    details: ['readiness.dimensions.personnel.detailNoRoster'],
    recommendations: ['readiness.recommendations.personnelAmber'],
    recommendationArgs: [{}],
  }
}

// ---------------------------------------------------------------------------
// Dimension 2: Reagents
// ---------------------------------------------------------------------------

export async function evaluateReagents(): Promise<DimensionResult> {
  let reagents
  try {
    reagents = await getActiveReagents()
  } catch {
    return {
      dimension: 'reagents',
      status: 'amber',
      titleKey: 'readiness.dimensions.reagents.title',
      summaryKey: 'readiness.dimensions.reagents.summaryUnavailable',
      details: [],
      recommendations: ['readiness.recommendations.reagentsUnavailable'],
      recommendationArgs: [{}],
    }
  }

  if (reagents.length === 0) {
    return {
      dimension: 'reagents',
      status: 'amber',
      titleKey: 'readiness.dimensions.reagents.title',
      summaryKey: 'readiness.dimensions.reagents.summaryNotConfigured',
      details: [],
      recommendations: ['readiness.recommendations.reagentsNotConfigured'],
      recommendationArgs: [{}],
    }
  }

  const details: string[] = []
  const recommendations: string[] = []
  const recommendationArgs: Array<Record<string, string | number>> = []
  const dimensionStatuses: RAGStatus[] = []

  for (const reagent of reagents) {
    // Already expired — immediate red
    if (reagent.status === ReagentStatus.EXPIRED) {
      dimensionStatuses.push('red')
      details.push('readiness.dimensions.reagents.detailExpired')
      recommendations.push('readiness.recommendations.reagentsRed')
      recommendationArgs.push({
        reagentName: reagent.name,
        testType: reagent.linkedTestCode,
        supplierName: reagent.manufacturer ?? 'supplier',
      })
      continue
    }

    // Calculate remaining tests
    const testsRemaining = reagent.expectedTests - reagent.testsPerformed
    if (testsRemaining <= 0) {
      dimensionStatuses.push('red')
      details.push('readiness.dimensions.reagents.detailStockout')
      recommendations.push('readiness.recommendations.reagentsRed')
      recommendationArgs.push({
        reagentName: reagent.name,
        testType: reagent.linkedTestCode,
        supplierName: reagent.manufacturer ?? 'supplier',
      })
      continue
    }

    // Use expiry date to determine days remaining
    const daysLeft = daysUntilDate(reagent.expiryDate)

    if (daysLeft <= 0) {
      dimensionStatuses.push('red')
      details.push('readiness.dimensions.reagents.detailExpired')
      recommendations.push('readiness.recommendations.reagentsRed')
      recommendationArgs.push({
        reagentName: reagent.name,
        testType: reagent.linkedTestCode,
        supplierName: reagent.manufacturer ?? 'supplier',
      })
    } else if (daysLeft <= 7) {
      dimensionStatuses.push('red')
      details.push('readiness.dimensions.reagents.detailCriticalLow')
      recommendations.push('readiness.recommendations.reagentsRed')
      recommendationArgs.push({
        reagentName: reagent.name,
        daysRemaining: daysLeft,
        testType: reagent.linkedTestCode,
        supplierName: reagent.manufacturer ?? 'supplier',
      })
    } else if (daysLeft <= 14) {
      dimensionStatuses.push('amber')
      details.push('readiness.dimensions.reagents.detailLow')
      recommendations.push('readiness.recommendations.reagentsAmber')
      recommendationArgs.push({
        reagentName: reagent.name,
        daysRemaining: daysLeft,
        testType: reagent.linkedTestCode,
      })
    } else {
      dimensionStatuses.push('green')
    }
  }

  const status = worstStatus(dimensionStatuses)
  const allGood = reagents.filter((_r, i) => dimensionStatuses[i] === 'green').length
  const total = reagents.length

  return {
    dimension: 'reagents',
    status,
    titleKey: 'readiness.dimensions.reagents.title',
    summaryKey:
      status === 'green'
        ? 'readiness.dimensions.reagents.summaryAllGood'
        : 'readiness.dimensions.reagents.summaryIssues',
    summaryArgs: { good: allGood, total },
    details: details.slice(0, 5), // cap at 5 detail lines per dimension
    recommendations: recommendations.slice(0, 3), // cap at 3 per pitfall note
    recommendationArgs: recommendationArgs.slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// Dimension 3: Equipment
// ---------------------------------------------------------------------------

export async function evaluateEquipment(): Promise<DimensionResult> {
  // Equipment tracking table does not exist yet (future story).
  // Graceful degradation: return amber with "not configured" message.
  // TODO: update once equipment tracking story is implemented.
  return {
    dimension: 'equipment',
    status: 'amber',
    titleKey: 'readiness.dimensions.equipment.title',
    summaryKey: 'readiness.dimensions.equipment.summaryNotConfigured',
    details: ['readiness.dimensions.equipment.detailNotConfigured'],
    recommendations: ['readiness.recommendations.equipmentAmber'],
    recommendationArgs: [{}],
  }
}

// ---------------------------------------------------------------------------
// Dimension 4: Pending Orders
// ---------------------------------------------------------------------------

export async function evaluatePendingOrders(): Promise<DimensionResult> {
  let orders
  try {
    orders = await getOrders()
  } catch {
    return {
      dimension: 'pendingOrders',
      status: 'amber',
      titleKey: 'readiness.dimensions.pendingOrders.title',
      summaryKey: 'readiness.dimensions.pendingOrders.summaryNotConfigured',
      details: [],
      recommendations: ['readiness.recommendations.ordersNotConfigured'],
      recommendationArgs: [{}],
    }
  }

  const pending = orders.filter(
    (o) => o.status === 'RECEIVED' || o.status === 'IN_PROGRESS',
  )

  if (pending.length === 0) {
    return {
      dimension: 'pendingOrders',
      status: 'green',
      titleKey: 'readiness.dimensions.pendingOrders.title',
      summaryKey: 'readiness.dimensions.pendingOrders.summaryNone',
      details: [],
      recommendations: [],
      recommendationArgs: [],
    }
  }

  const urgentCount = pending.filter(
    (o) => o.urgency === 'urgent' || o.urgency === 'asap' || o.urgency === 'stat',
  ).length

  const status: RAGStatus = urgentCount > 0 ? 'red' : 'amber'

  const recommendations: string[] = []
  const recommendationArgs: Array<Record<string, string | number>> = []

  if (urgentCount > 0) {
    recommendations.push('readiness.recommendations.ordersRed')
    recommendationArgs.push({ urgentCount })
  } else {
    recommendations.push('readiness.recommendations.ordersAmber')
    recommendationArgs.push({ pendingCount: pending.length })
  }

  return {
    dimension: 'pendingOrders',
    status,
    titleKey: 'readiness.dimensions.pendingOrders.title',
    summaryKey: 'readiness.dimensions.pendingOrders.summary',
    summaryArgs: { total: pending.length, urgent: urgentCount },
    details: ['readiness.dimensions.pendingOrders.detail'],
    recommendations,
    recommendationArgs,
  }
}

// ---------------------------------------------------------------------------
// Dimension 5: Power
// ---------------------------------------------------------------------------

export async function evaluatePower(): Promise<DimensionResult> {
  let powerBudget
  try {
    powerBudget = await calculatePowerBudget(new Date())
  } catch {
    return {
      dimension: 'power',
      status: 'amber',
      titleKey: 'readiness.dimensions.power.title',
      summaryKey: 'readiness.dimensions.power.summaryNotConfigured',
      details: [],
      recommendations: ['readiness.recommendations.powerAmber'],
      recommendationArgs: [{}],
    }
  }

  if (!powerBudget) {
    return {
      dimension: 'power',
      status: 'amber',
      titleKey: 'readiness.dimensions.power.title',
      summaryKey: 'readiness.dimensions.power.summaryNotConfigured',
      details: ['readiness.dimensions.power.detailNoSchedule'],
      recommendations: ['readiness.recommendations.powerAmber'],
      recommendationArgs: [{}],
    }
  }

  const { startTime, endTime, totalMinutes, remainingMinutes } = powerBudget

  if (remainingMinutes <= 0) {
    // Power window has fully elapsed for today
    return {
      dimension: 'power',
      status: 'red',
      titleKey: 'readiness.dimensions.power.title',
      summaryKey: 'readiness.dimensions.power.summaryElapsed',
      summaryArgs: { startTime, endTime },
      details: ['readiness.dimensions.power.detailElapsed'],
      recommendations: ['readiness.recommendations.powerRed'],
      recommendationArgs: [{}],
    }
  }

  const percentElapsed = Math.round(
    ((totalMinutes - remainingMinutes) / totalMinutes) * 100,
  )

  if (percentElapsed > 0) {
    // Power window is partially elapsed
    return {
      dimension: 'power',
      status: 'amber',
      titleKey: 'readiness.dimensions.power.title',
      summaryKey: 'readiness.dimensions.power.summaryPartial',
      summaryArgs: { startTime, endTime, remainingMinutes },
      details: ['readiness.dimensions.power.detailPartial'],
      recommendations: ['readiness.recommendations.powerPartialAmber'],
      recommendationArgs: [{ percentElapsed, remainingMinutes }],
    }
  }

  // Power window has not started yet — full duration available
  return {
    dimension: 'power',
    status: 'green',
    titleKey: 'readiness.dimensions.power.title',
    summaryKey: 'readiness.dimensions.power.summaryUpcoming',
    summaryArgs: { startTime, endTime, totalMinutes },
    details: [],
    recommendations: [],
    recommendationArgs: [],
  }
}

// ---------------------------------------------------------------------------
// Main: Generate full readiness briefing
// ---------------------------------------------------------------------------

export async function generateReadinessBriefing(): Promise<ReadinessBriefing> {
  const [personnel, reagents, equipment, pendingOrders, power] = await Promise.all([
    evaluatePersonnel(),
    evaluateReagents(),
    evaluateEquipment(),
    evaluatePendingOrders(),
    evaluatePower(),
  ])

  const dimensions = [personnel, reagents, equipment, pendingOrders, power]
  const overallStatus = worstStatus(dimensions.map((d) => d.status))

  return {
    dimensions,
    overallStatus,
    generatedAt: new Date().toISOString(),
    refreshable: true,
  }
}
