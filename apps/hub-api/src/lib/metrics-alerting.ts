import {
  getRequestDurationHistogram,
  getRequestErrorsCounter,
} from '@/trpc/middleware/metrics'
import { sendAlert } from '@/lib/alert-notifier'

/**
 * Metrics Alerting Evaluator — Story 23.1 Tasks 4 & 5.
 *
 * Evaluates in-memory histogram and counter data on a 60-second interval.
 * - P95 latency: >500ms reads / >1000ms writes → P2 alert
 * - Error rate: >1% over 5-minute window → P2 alert
 * - Auto-resolve after 5 consecutive healthy evaluations
 * - Debounce: no re-alert for same condition within 15 minutes
 */

// Thresholds (ms)
const READ_P95_THRESHOLD = 500
const WRITE_P95_THRESHOLD = 1000
const ERROR_RATE_THRESHOLD = 0.01 // 1%
const AUTO_RESOLVE_COUNT = 5
const DEBOUNCE_MS = 15 * 60 * 1000 // 15 minutes

// Alert state tracking
interface AlertState {
  active: boolean
  lastAlertAt: number
  consecutiveHealthy: number
}

const p95Alerts = new Map<string, AlertState>()
const errorRateState: AlertState = { active: false, lastAlertAt: 0, consecutiveHealthy: 0 }

/**
 * Calculate P95 from histogram bucket values using linear interpolation.
 * Buckets are the cumulative counts from prom-client histogram.
 */
function calculateP95FromBuckets(
  buckets: Array<{ le: string; count: number }>,
): number | null {
  if (buckets.length === 0) return null

  const total = buckets[buckets.length - 1]?.count ?? 0
  if (total === 0) return null

  const targetCount = total * 0.95

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count >= targetCount) {
      // Linear interpolation within the bucket
      const prevCount = i > 0 ? buckets[i - 1].count : 0
      const prevBound = i > 0 ? parseFloat(buckets[i - 1].le) : 0
      const currBound = parseFloat(buckets[i].le)

      if (isNaN(currBound) || currBound === Infinity) {
        return prevBound > 0 ? prevBound : null
      }

      const bucketRange = currBound - prevBound
      const countInBucket = buckets[i].count - prevCount
      if (countInBucket === 0) return currBound

      const fraction = (targetCount - prevCount) / countInBucket
      return prevBound + fraction * bucketRange
    }
  }

  return null
}

/**
 * Group histogram values by procedure and calculate P95 for each.
 */
function groupBucketsByProcedure(
  values: Array<{ labels: Record<string, string>; value: number }>,
): Map<string, { type: string; p95: number }> {
  // Group by router.procedure.type
  const groups = new Map<string, Array<{ le: string; count: number }>>()
  const types = new Map<string, string>()

  for (const v of values) {
    const le = v.labels.le
    if (!le) continue // skip non-bucket values (sum, count)

    const key = `${v.labels.router}.${v.labels.procedure}.${v.labels.type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ le, count: v.value })
    types.set(key, v.labels.type)
  }

  const result = new Map<string, { type: string; p95: number }>()

  for (const [key, buckets] of groups) {
    // Sort by bucket boundary
    buckets.sort((a, b) => {
      const aVal = a.le === '+Inf' ? Infinity : parseFloat(a.le)
      const bVal = b.le === '+Inf' ? Infinity : parseFloat(b.le)
      return aVal - bVal
    })

    const p95 = calculateP95FromBuckets(buckets)
    if (p95 !== null) {
      result.set(key, { type: types.get(key)!, p95 })
    }
  }

  return result
}

/**
 * Evaluate P95 latency alerts — runs every 60s.
 * Reads from the in-memory histogram (no I/O).
 */
export async function evaluateP95Alerts(): Promise<void> {
  const histogram = getRequestDurationHistogram()
  const metricData = await histogram.get()
  const procedures = groupBucketsByProcedure(metricData.values as Array<{ labels: Record<string, string>; value: number }>)

  for (const [key, { type, p95 }] of procedures) {
    const threshold = type === 'mutation' ? WRITE_P95_THRESHOLD : READ_P95_THRESHOLD
    const exceeds = p95 > threshold
    const state = p95Alerts.get(key) ?? { active: false, lastAlertAt: 0, consecutiveHealthy: 0 }

    if (exceeds) {
      state.consecutiveHealthy = 0

      if (!state.active || Date.now() - state.lastAlertAt > DEBOUNCE_MS) {
        state.active = true
        state.lastAlertAt = Date.now()
        p95Alerts.set(key, state)

        await sendAlert({
          severity: 'P2',
          title: `P95 Latency Alert: ${key}`,
          description: `${key} P95 is ${Math.round(p95)}ms (threshold: ${threshold}ms)`,
          metric: 'trpc_request_duration_ms',
          currentValue: Math.round(p95),
          threshold,
          timestamp: new Date().toISOString(),
        })
      } else {
        p95Alerts.set(key, state)
      }
    } else if (state.active) {
      state.consecutiveHealthy++

      if (state.consecutiveHealthy >= AUTO_RESOLVE_COUNT) {
        state.active = false
        state.consecutiveHealthy = 0
        p95Alerts.set(key, state)

        await sendAlert({
          severity: 'P2',
          title: `RESOLVED — P95 Latency: ${key}`,
          description: `${key} P95 is now ${Math.round(p95)}ms (threshold: ${threshold}ms)`,
          metric: 'trpc_request_duration_ms',
          currentValue: Math.round(p95),
          threshold,
          timestamp: new Date().toISOString(),
        })
      } else {
        p95Alerts.set(key, state)
      }
    }
  }
}

/**
 * Retrieve the top N error codes from the errors counter.
 */
async function getTopErrorCodes(limit: number): Promise<Array<{ code: string; count: number }>> {
  try {
    const counter = getRequestErrorsCounter()
    const data = await counter.get()
    const codeCounts = new Map<string, number>()
    for (const v of data.values as Array<{ labels: Record<string, string>; value: number }>) {
      const code = v.labels.error_code
      if (code) {
        codeCounts.set(code, (codeCounts.get(code) ?? 0) + v.value)
      }
    }
    return [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([code, count]) => ({ code, count }))
  } catch {
    return []
  }
}

/**
 * Evaluate error rate alerts — runs every 60s.
 * Accepts total errors and total requests for the 5-minute window.
 * In production, these values come from counter diffs; in tests, passed directly.
 */
export async function evaluateErrorRateAlerts(
  totalErrors: number,
  totalRequests: number,
): Promise<void> {
  if (totalRequests === 0) return

  const errorRate = totalErrors / totalRequests
  const exceeds = errorRate > ERROR_RATE_THRESHOLD

  if (exceeds) {
    errorRateState.consecutiveHealthy = 0

    if (!errorRateState.active || Date.now() - errorRateState.lastAlertAt > DEBOUNCE_MS) {
      errorRateState.active = true
      errorRateState.lastAlertAt = Date.now()

      // Collect top error codes for the alert payload
      const topErrorCodes = await getTopErrorCodes(5)
      const errorCodesStr = topErrorCodes.length > 0
        ? ` Top errors: ${topErrorCodes.map(e => `${e.code}(${e.count})`).join(', ')}`
        : ''

      await sendAlert({
        severity: 'P2',
        title: 'Error Rate Alert',
        description: `Error rate is ${(errorRate * 100).toFixed(2)}% (threshold: 1%). Errors: ${totalErrors}, Total: ${totalRequests}.${errorCodesStr}`,
        metric: 'trpc_request_errors_total',
        currentValue: Math.round(errorRate * 10000) / 100,
        threshold: 1,
        timestamp: new Date().toISOString(),
      })
    }
  } else if (errorRateState.active) {
    errorRateState.consecutiveHealthy++

    if (errorRateState.consecutiveHealthy >= AUTO_RESOLVE_COUNT) {
      errorRateState.active = false
      errorRateState.consecutiveHealthy = 0

      await sendAlert({
        severity: 'P2',
        title: 'RESOLVED — Error Rate',
        description: `Error rate is now ${(errorRate * 100).toFixed(2)}% (threshold: 1%)`,
        metric: 'trpc_request_errors_total',
        currentValue: Math.round(errorRate * 10000) / 100,
        threshold: 1,
        timestamp: new Date().toISOString(),
      })
    }
  }
}

/** Reset all alert state — for testing only. */
export function _resetAlertState(): void {
  p95Alerts.clear()
  errorRateState.active = false
  errorRateState.lastAlertAt = 0
  errorRateState.consecutiveHealthy = 0
}
