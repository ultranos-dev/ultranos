/**
 * Trip Optimizer — multi-order analysis algorithm.
 * Classifies lab tests into wait/remote/return buckets and
 * produces a patient-facing trip recommendation.
 *
 * No AI or ML — pure lookup + max calculation.
 * Story 45.5 — Task 2
 */

import type { LabOrderEntry } from '@/lib/db'
import { getTatProfile, type TestTatProfile } from '@/lib/test-tat-database'
import { addBusinessDays } from '@/lib/business-days'

export interface TripAnalysis {
  /** Tests the patient should wait for (rapid / same-day) */
  waitTests: TestTatProfile[]
  /** Extended tests delivered to doctor remotely — no return needed */
  remoteTests: TestTatProfile[]
  /** Extended tests that require the patient to return */
  returnTests: TestTatProfile[]
  /** Maximum wait time in minutes across all waitTests */
  estimatedWaitMinutes: number
  /** ISO date string if returnTests exist, otherwise null */
  optimalReturnDate: string | null
  recommendation: 'wait' | 'wait-and-return' | 'no-return' | 'return-only'
}

/**
 * Analyze a list of lab orders and produce a trip optimization result.
 *
 * @param orders   - active orders for the patient
 * @param today    - ISO date string (YYYY-MM-DD) — the collection date
 * @param overrides - optional lab-customized TAT profiles keyed by loincCode
 * @param weekend  - weekend day numbers (default: [4,5] = Thu+Fri for Afghanistan)
 */
export function analyzeTripRequirements(
  orders: LabOrderEntry[],
  today: string,
  overrides: Partial<Record<string, TestTatProfile>> = {},
  weekend?: number[],
): TripAnalysis {
  // Collect all unique LOINC codes across orders
  const seenCodes = new Set<string>()
  const allTests: TestTatProfile[] = []

  for (const order of orders) {
    for (const requested of order.testsRequested) {
      if (seenCodes.has(requested.loincCode)) continue
      seenCodes.add(requested.loincCode)

      const profile = getTatProfile(requested.loincCode, overrides)
      if (!profile) continue // unknown code — skip silently
      allTests.push(profile)
    }
  }

  const waitTests: TestTatProfile[] = []
  const remoteTests: TestTatProfile[] = []
  const returnTests: TestTatProfile[] = []

  for (const profile of allTests) {
    if (profile.tatCategory === 'rapid' || profile.tatCategory === 'same-day') {
      waitTests.push(profile)
    } else if (profile.remoteDelivery) {
      remoteTests.push(profile)
    } else {
      returnTests.push(profile)
    }
  }

  const estimatedWaitMinutes =
    waitTests.length > 0 ? Math.max(...waitTests.map((t) => t.estimatedMinutes)) : 0

  let optimalReturnDate: string | null = null
  if (returnTests.length > 0) {
    const maxDays = Math.max(
      ...returnTests.map((t) => t.estimatedDays ?? 1),
    )
    optimalReturnDate = addBusinessDays(today, maxDays, weekend)
  }

  const recommendation = deriveRecommendation(waitTests, remoteTests, returnTests)

  return {
    waitTests,
    remoteTests,
    returnTests,
    estimatedWaitMinutes,
    optimalReturnDate,
    recommendation,
  }
}

function deriveRecommendation(
  waitTests: TestTatProfile[],
  remoteTests: TestTatProfile[],
  returnTests: TestTatProfile[],
): TripAnalysis['recommendation'] {
  const hasWait = waitTests.length > 0
  const hasReturn = returnTests.length > 0
  const hasRemote = remoteTests.length > 0

  if (hasReturn && hasWait) return 'wait-and-return'
  if (hasReturn) return 'return-only'
  if (hasRemote && !hasWait) return 'no-return'
  return 'wait'
}
