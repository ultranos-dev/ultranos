/**
 * Trend Detection Algorithm — Story 43.6
 *
 * Detects calibration drift via directional trend analysis.
 * Separate from Westgard rules — catches gradual drift that individual
 * Westgard rules might miss (e.g., slowly increasing values that never
 * exceed 2SD but consistently move in one direction).
 *
 * Trend criterion: 5 or more CONSECUTIVE values each higher (or lower)
 * than the previous value.
 */

import type { TrendResult } from './types'

/**
 * Detect a directional trend in a series of QC values.
 *
 * A trend is defined as 5+ consecutive values each moving in the same direction
 * (each value strictly higher OR strictly lower than the previous).
 *
 * Returns the MOST RECENT trend found (i.e., the trend that ends at the last value).
 * Returns null if no trend of 5+ consecutive direction values exists ending at the last value.
 *
 * @param values - Array of observed QC values, ordered oldest → newest
 */
export function detectTrend(values: number[]): TrendResult | null {
  if (values.length < 5) return null

  // Walk backwards from the end to find the longest consecutive directional run
  // ending at the last value
  let consecutiveCount = 1
  const lastIdx = values.length - 1

  // Determine direction of the most recent step
  if (lastIdx === 0) return null
  const lastDiff = values[lastIdx] - values[lastIdx - 1]
  if (lastDiff === 0) return null  // No movement — no trend

  const direction: 'UP' | 'DOWN' = lastDiff > 0 ? 'UP' : 'DOWN'

  // Extend backwards while direction is consistent
  for (let i = lastIdx - 1; i > 0; i--) {
    const diff = values[i] - values[i - 1]
    if (direction === 'UP' && diff > 0) {
      consecutiveCount++
    } else if (direction === 'DOWN' && diff < 0) {
      consecutiveCount++
    } else {
      break
    }
  }

  if (consecutiveCount < 5) return null

  // Calculate start index of the consecutive run
  const startIndex = lastIdx - consecutiveCount  // index of first value in the run (the base point)

  // Linear regression slope over the consecutive values (the run itself, not the base)
  const runValues = values.slice(startIndex, lastIdx + 1)
  const slope = calculateSlope(runValues)

  return {
    direction,
    consecutiveCount,
    startIndex,
    slope,
  }
}

/**
 * Calculate linear regression slope (rise / run) for an array of y-values.
 * x values are assumed to be 0, 1, 2, ... (equally spaced runs).
 */
function calculateSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  const xMean = (n - 1) / 2
  const yMean = values.reduce((sum, v) => sum + v, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean)
    denominator += (i - xMean) * (i - xMean)
  }

  return denominator === 0 ? 0 : numerator / denominator
}
