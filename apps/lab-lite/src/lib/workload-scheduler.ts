/**
 * Power-Aware Workload Scheduler — Story 48.1
 *
 * All computation runs against local Dexie data — fully offline.
 * No patient names or IDs are processed (CLAUDE.md Rule #7).
 */

import {
  getActiveScheduleForDay,
  getTestTimeEstimate,
  type PowerScheduleEntry,
  type TestTimeEstimate,
} from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingOrder {
  loincCode: string
  urgency: 'routine' | 'urgent' | 'asap' | 'stat'
  /** Opaque patient reference — never a name or ID displayed to scheduler */
  patientRef: string
}

export interface TaggedTest extends PendingOrder {
  requiresPower: boolean
  estimatedMinutes: number
  batchSize: number
  displayName: string
}

export interface PowerBudget {
  startTime: string // HH:mm
  endTime: string // HH:mm
  totalMinutes: number
  remainingMinutes: number
}

export type SchedulePhase = 'power' | 'manual' | 'overflow'
export type WarningSeverity = 'amber' | 'red'

export interface ScheduledGroup {
  loincCode: string
  displayName: string
  testCount: number
  estimatedMinutes: number
  phase: SchedulePhase
  hasUrgent: boolean
}

export interface TimeWarning {
  message: string
  severity: WarningSeverity
}

export interface WorkloadSchedule {
  scheduledGroups: ScheduledGroup[]
  budget: { total: number; used: number; remaining: number }
  warnings: TimeWarning[]
}

// ---------------------------------------------------------------------------
// Default fallback for unknown LOINC codes
// ---------------------------------------------------------------------------

const FALLBACK_ESTIMATE: TestTimeEstimate = {
  loincCode: 'UNKNOWN',
  displayName: 'Unknown Test',
  estimatedMinutes: 15,
  requiresPower: true,
  batchSize: 1,
  updatedAt: '',
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Look up test time estimate from Dexie, with conservative fallback. */
export async function getTestPowerRequirement(
  loincCode: string,
): Promise<TestTimeEstimate> {
  const estimate = await getTestTimeEstimate(loincCode)
  if (estimate) return estimate
  // F11: Do not log the LOINC code — it is PHI-adjacent per CLAUDE.md Rule #1.
  console.warn('[workload-scheduler] Unknown LOINC code — using conservative defaults (15 min, requires-power, batch 1)')
  return { ...FALLBACK_ESTIMATE, loincCode }
}

/** Enrich each pending order with power/time/batch info from Dexie. */
export async function tagPendingTests(
  pendingOrders: PendingOrder[],
): Promise<TaggedTest[]> {
  const results: TaggedTest[] = []
  for (const order of pendingOrders) {
    const estimate = await getTestPowerRequirement(order.loincCode)
    results.push({
      ...order,
      requiresPower: estimate.requiresPower,
      estimatedMinutes: estimate.estimatedMinutes,
      batchSize: Math.max(1, estimate.batchSize), // Guard against 0/negative
      displayName: estimate.displayName,
    })
  }
  return results
}

/** Parse HH:mm time string to total minutes since midnight. Throws on malformed input. */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) throw new Error(`Invalid time format: expected HH:mm`)
  return h * 60 + m
}

/** Add minutes to HH:mm time string, returning new HH:mm. */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = parseTimeToMinutes(time) + minutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Calculate power budget for a given date using Dexie power schedules. */
export async function calculatePowerBudget(
  scheduleDate: Date,
): Promise<PowerBudget | null> {
  const dayOfWeek = scheduleDate.getDay()
  const schedule = await getActiveScheduleForDay(dayOfWeek)
  if (!schedule) return null

  const endTime = addMinutesToTime(schedule.startTime, schedule.durationMinutes)
  const totalMinutes = schedule.durationMinutes

  // Calculate remaining minutes if power window has started
  const now = new Date()
  const isSameDay =
    now.getFullYear() === scheduleDate.getFullYear() &&
    now.getMonth() === scheduleDate.getMonth() &&
    now.getDate() === scheduleDate.getDate()

  let remainingMinutes = totalMinutes

  if (isSameDay) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const startMinutes = parseTimeToMinutes(schedule.startTime)
    // Add 1440 when window spans midnight (e.g. 22:00 + 240 min → endMinutes = 1560, not 120)
    const endMinutes = startMinutes + schedule.durationMinutes

    // Normalise currentMinutes for midnight-spanning windows: if current wall-clock is before
    // midnight but the window ends after midnight, shift current forward by 1440.
    const normCurrent =
      endMinutes > 1440 && currentMinutes < startMinutes
        ? currentMinutes + 1440
        : currentMinutes

    if (normCurrent >= endMinutes) {
      // Power window already ended
      remainingMinutes = 0
    } else if (normCurrent > startMinutes) {
      // Power window partially elapsed
      remainingMinutes = endMinutes - normCurrent
    }
    // else: power window hasn't started yet, full duration available
  }

  return {
    startTime: schedule.startTime,
    endTime,
    totalMinutes,
    remainingMinutes,
  }
}

/**
 * Estimate total analyzer time for power-requiring tests,
 * accounting for batch parallelism.
 * Formula: sum( ceil(count / batchSize) * estimatedMinutes ) per test type.
 */
export function estimateTotalAnalyzerTime(taggedTests: TaggedTest[]): number {
  const powerTests = taggedTests.filter((t) => t.requiresPower)

  // Group by loincCode
  const groups = new Map<string, { count: number; estimatedMinutes: number; batchSize: number }>()
  for (const test of powerTests) {
    const existing = groups.get(test.loincCode)
    if (existing) {
      existing.count++
    } else {
      groups.set(test.loincCode, {
        count: 1,
        estimatedMinutes: test.estimatedMinutes,
        batchSize: Math.max(1, test.batchSize),
      })
    }
  }

  let total = 0
  for (const group of groups.values()) {
    total += Math.ceil(group.count / group.batchSize) * group.estimatedMinutes
  }
  return total
}

const URGENT_PRIORITIES = new Set<string>(['stat', 'asap', 'urgent'])

/** Generate a prioritized work schedule. */
export function generateSchedule(
  taggedTests: TaggedTest[],
  budget: PowerBudget,
): WorkloadSchedule {
  const powerTests = taggedTests.filter((t) => t.requiresPower)
  const manualTests = taggedTests.filter((t) => !t.requiresPower)

  // Group power tests by loincCode
  const groupMap = new Map<
    string,
    { tests: TaggedTest[]; estimatedMinutes: number; batchSize: number; displayName: string; hasUrgent: boolean }
  >()
  for (const test of powerTests) {
    const existing = groupMap.get(test.loincCode)
    if (existing) {
      existing.tests.push(test)
      if (URGENT_PRIORITIES.has(test.urgency)) existing.hasUrgent = true
    } else {
      groupMap.set(test.loincCode, {
        tests: [test],
        estimatedMinutes: test.estimatedMinutes,
        batchSize: Math.max(1, test.batchSize),
        displayName: test.displayName,
        hasUrgent: URGENT_PRIORITIES.has(test.urgency),
      })
    }
  }

  // Calculate batch time for each group
  const groups = Array.from(groupMap.entries()).map(([loincCode, g]) => ({
    loincCode,
    displayName: g.displayName,
    testCount: g.tests.length,
    estimatedMinutes: Math.ceil(g.tests.length / g.batchSize) * g.estimatedMinutes,
    hasUrgent: g.hasUrgent,
  }))

  // Sort: urgent first, then by shortest batch time (pack efficiently)
  groups.sort((a, b) => {
    if (a.hasUrgent !== b.hasUrgent) return a.hasUrgent ? -1 : 1
    return a.estimatedMinutes - b.estimatedMinutes
  })

  // Greedily pack into power window
  let usedMinutes = 0
  const scheduled: ScheduledGroup[] = []

  for (const group of groups) {
    if (usedMinutes + group.estimatedMinutes <= budget.remainingMinutes) {
      scheduled.push({ ...group, phase: 'power' })
      usedMinutes += group.estimatedMinutes
    } else {
      scheduled.push({ ...group, phase: 'overflow' })
    }
  }

  // Group manual tests by loincCode — apply batch formula for consistency (F13)
  const manualGroupMap = new Map<string, { count: number; displayName: string; estimatedMinutes: number; batchSize: number }>()
  for (const test of manualTests) {
    const existing = manualGroupMap.get(test.loincCode)
    if (existing) {
      existing.count++
    } else {
      manualGroupMap.set(test.loincCode, {
        count: 1,
        displayName: test.displayName,
        estimatedMinutes: test.estimatedMinutes,
        batchSize: Math.max(1, test.batchSize),
      })
    }
  }

  for (const [loincCode, g] of manualGroupMap) {
    scheduled.push({
      loincCode,
      displayName: g.displayName,
      testCount: g.count,
      estimatedMinutes: Math.ceil(g.count / g.batchSize) * g.estimatedMinutes,
      phase: 'manual',
      hasUrgent: false,
    })
  }

  const totalAnalyzerTime = groups.reduce((sum, g) => sum + g.estimatedMinutes, 0)

  const warnings: TimeWarning[] = []
  if (totalAnalyzerTime > budget.remainingMinutes) {
    warnings.push({
      message: `You have ${Math.round(budget.remainingMinutes / 60 * 10) / 10} hours of power. Your pending queue needs ~${Math.round(totalAnalyzerTime / 60 * 10) / 10} hours of analyzer time. Here is what to prioritize.`,
      severity: 'red',
    })
  } else if (totalAnalyzerTime > budget.remainingMinutes * 0.8) {
    warnings.push({
      message: `Analyzer time is near your power budget (${Math.round(totalAnalyzerTime / 60 * 10) / 10}h needed, ${Math.round(budget.remainingMinutes / 60 * 10) / 10}h available).`,
      severity: 'amber',
    })
  }

  return {
    scheduledGroups: scheduled,
    budget: {
      total: budget.totalMinutes,
      used: usedMinutes,
      remaining: budget.remainingMinutes - usedMinutes,
    },
    warnings,
  }
}

/** Detect time-sensitive warnings based on current time vs power window end. */
export function detectTimeWarnings(
  schedule: WorkloadSchedule,
  budget: PowerBudget,
): TimeWarning[] {
  const warnings: TimeWarning[] = []
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  // Normalise end time to handle midnight-spanning windows
  const endMinutesRaw = parseTimeToMinutes(budget.endTime)
  const startMinutes = parseTimeToMinutes(budget.startTime)
  const endMinutes = endMinutesRaw <= startMinutes ? endMinutesRaw + 1440 : endMinutesRaw
  const normCurrent =
    endMinutes > 1440 && currentMinutes < startMinutes ? currentMinutes + 1440 : currentMinutes

  // Each power-phase group must start no later than (endMinutes - cumulativeTime) to finish.
  // cumulativeTime grows as groups are processed in schedule order.
  let cumulativeTime = 0
  for (const group of schedule.scheduledGroups) {
    if (group.phase !== 'power') continue
    cumulativeTime += group.estimatedMinutes
    const latestStart = endMinutes - cumulativeTime
    const minutesPastDeadline = normCurrent - latestStart

    if (minutesPastDeadline > 0 && normCurrent < endMinutes) {
      // F08: X is the minutes ALREADY elapsed past the latest safe start, not "minutes left to wait"
      warnings.push({
        message: `Start ${group.displayName} now — you are ${minutesPastDeadline} minute${minutesPastDeadline === 1 ? '' : 's'} past the latest safe start time to finish before shutdown.`,
        severity: minutesPastDeadline > 15 ? 'red' : 'amber',
      })
    }
  }

  return warnings
}
