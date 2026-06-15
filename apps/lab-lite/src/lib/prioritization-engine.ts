/**
 * Prioritization engine for the smart sample worklist.
 *
 * All functions are pure (no side effects, no async, no network calls).
 * The entire pipeline works offline over in-memory data — CLAUDE.md offline-first rule.
 *
 * Algorithm overview:
 *   1. Score each sample with computePriorityScore() — lower = higher priority
 *   2. Sort ascending by score
 *   3. Apply within-tier batching (same test type grouped, max 3-position shift)
 *   4. Apply manual overrides (pinned positions from priorityOverrides table)
 */

import { getStabilityStatus, getStabilityWindowMinutes, type StabilityStatus } from './sample-stability'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SampleUrgency = 'stat' | 'urgent' | 'routine'

export interface PrioritizedSample {
  /** Opaque sample/order identifier. */
  sampleId: string
  orderId: string
  /** Data-minimized patient reference — first name + age ONLY (CLAUDE.md Rule #7). */
  patientRef: { firstName: string; age: number }
  loincCode: string
  loincDisplay: string
  urgency: SampleUrgency
  /** ISO timestamp — when sample was received/accessioned. */
  receivedAt: string
  stabilityWindowMinutes: number
  stabilityStatus: StabilityStatus
  remainingMinutes: number
  timeInQueueMinutes: number
  priorityScore: number
  /** e.g. "CBC" — used for visual batch grouping. */
  batchGroup: string
  isManualOverride: boolean
}

/** Minimum data needed to compute a priority score. */
export interface SampleInput {
  sampleId: string
  orderId: string
  patientRef: { firstName: string; age: number }
  loincCode: string
  loincDisplay: string
  urgency: SampleUrgency
  receivedAt: string
}

// ---------------------------------------------------------------------------
// Urgency weights — lower = higher priority
// ---------------------------------------------------------------------------

const URGENCY_WEIGHT: Record<SampleUrgency, number> = {
  stat: 0,
  urgent: 1000,
  routine: 2000,
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Compute the composite priority score for a single sample.
 * Lower score → process first.
 *
 * Formula:
 *   score = urgencyWeight
 *         + stabilityPenalty   (max(0, window - remaining) * 10)
 *         + (expired ? -5000 : 0)
 *         + timeInQueueBonus   (-1 * timeInQueueMinutes)
 *
 * The -5000 expired penalty ensures expired samples always float to the top
 * regardless of urgency tier.
 *
 * Stability bonus: fraction of window consumed, scaled to [-200, 0].
 * More consumed → more negative → lower score → higher priority.
 * This correctly priorities samples closer to expiry over fresh ones.
 */
export function computePriorityScore(input: SampleInput): PrioritizedSample {
  const stabilityWindowMinutes = getStabilityWindowMinutes(input.loincCode)
  const { status: stabilityStatus, remainingMinutes } = getStabilityStatus(
    input.receivedAt,
    stabilityWindowMinutes,
  )

  const now = Date.now()
  const timeInQueueMinutes = (now - new Date(input.receivedAt).getTime()) / 60_000

  const urgencyWeight = URGENCY_WEIGHT[input.urgency]
  // Fraction of stability window consumed (0 = fresh, 1 = at expiry). Capped at 1.
  const fractionConsumed = Math.min(timeInQueueMinutes / stabilityWindowMinutes, 1.0)
  // More consumed → more negative → lower score = higher priority.
  const stabilityBonus = -fractionConsumed * 200
  const expiredBoost = stabilityStatus === 'expired' ? -5000 : 0
  // Longer wait = lower score = higher priority.
  const timeInQueueBonus = -1 * Math.floor(timeInQueueMinutes)

  const priorityScore = urgencyWeight + stabilityBonus + expiredBoost + timeInQueueBonus

  return {
    sampleId: input.sampleId,
    orderId: input.orderId,
    patientRef: input.patientRef,
    loincCode: input.loincCode,
    loincDisplay: input.loincDisplay,
    urgency: input.urgency,
    receivedAt: input.receivedAt,
    stabilityWindowMinutes,
    stabilityStatus,
    remainingMinutes,
    timeInQueueMinutes: Math.floor(timeInQueueMinutes),
    priorityScore,
    batchGroup: deriveBatchGroup(input.loincCode, input.loincDisplay),
    isManualOverride: false,
  }
}

/**
 * Derive a short batch group label from LOINC code or display name.
 * Used to visually group same-type tests in the worklist.
 */
function deriveBatchGroup(loincCode: string, loincDisplay: string): string {
  // Map known LOINC codes to canonical batch group names
  const knownGroups: Record<string, string> = {
    '82803-4': 'Blood Gas',
    '630-4': 'Urine Culture',
    '58410-2': 'CBC',
    '57698-3': 'Lipid Panel',
    '4548-4': 'HbA1c',
    '51990-0': 'BMP',
    '24325-3': 'LFT',
    '3016-3': 'TSH',
    '24356-8': 'Urinalysis',
    '1558-6': 'Glucose',
    '5902-2': 'Coag/PT-INR',
    '4537-7': 'ESR',
    '600-7': 'Blood Culture',
    '49581-7': 'CSF',
  }
  return knownGroups[loincCode] ?? (loincDisplay.split('—')[0].trim() || loincCode)
}

// ---------------------------------------------------------------------------
// Sort + batching
// ---------------------------------------------------------------------------

/**
 * Sort and batch samples for the worklist.
 *
 * Steps:
 *   1. Compute priority scores for all inputs
 *   2. Sort ascending by score (lower = higher priority)
 *   3. Apply within-tier batching (max 3-position shift per sample)
 *
 * Returns a new array — does not mutate input.
 */
export function prioritizeSamples(inputs: SampleInput[]): PrioritizedSample[] {
  if (inputs.length === 0) return []

  // Step 1 & 2: score and sort
  const scored = inputs.map(computePriorityScore)
  scored.sort((a, b) => a.priorityScore - b.priorityScore)

  // Step 3: apply batching within urgency tiers
  return applyBatching(scored)
}

/**
 * Apply batching optimisation within urgency tiers.
 *
 * Expired samples are extracted first and placed at the very top (they are a
 * "critical action" tier above STAT). Within each remaining tier (stat →
 * urgent → routine), same-type tests are grouped adjacent to minimise reagent
 * swaps. Batching never crosses urgency boundaries.
 */
function applyBatching(sorted: PrioritizedSample[]): PrioritizedSample[] {
  // Expired samples always float to the top, sorted by score among themselves.
  const expired = sorted.filter((s) => s.stabilityStatus === 'expired')
  const active = sorted.filter((s) => s.stabilityStatus !== 'expired')

  const tiers: SampleUrgency[] = ['stat', 'urgent', 'routine']
  const result: PrioritizedSample[] = [...expired]

  for (const tier of tiers) {
    const tierSamples = active.filter((s) => s.urgency === tier)
    result.push(...batchWithinTier(tierSamples))
  }

  return result
}

/**
 * Batch same-type tests adjacent to each other within a single urgency tier.
 *
 * Rule: if a sample's batchGroup matches a sample within 3 positions ahead,
 * slide it adjacent. Never move more than 3 positions from original index.
 */
function batchWithinTier(tier: PrioritizedSample[]): PrioritizedSample[] {
  if (tier.length <= 1) return tier

  const result = [...tier]

  for (let i = 0; i < result.length; i++) {
    const current = result[i]
    const nextItem = result[i + 1]

    // If the immediately next item is already the same group, we're already batched.
    if (nextItem && nextItem.batchGroup === current.batchGroup) continue

    // Look ahead up to 3 positions for a same-group sample to pull adjacent.
    for (let j = i + 2; j <= Math.min(i + 3, result.length - 1); j++) {
      if (result[j]?.batchGroup === current.batchGroup) {
        // Slide result[j] to position i+1
        const target = result.splice(j, 1)[0]!
        result.splice(i + 1, 0, target)
        break
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Manual override application
// ---------------------------------------------------------------------------

export interface PriorityOverride {
  sampleId: string
  manualPosition: number
  overriddenAt: string
}

/**
 * Apply manual overrides to a prioritized list.
 *
 * Samples with an override entry are pinned at their manual position.
 * The remaining samples fill in around the pinned items in their
 * algorithm-sorted order.
 */
export function applyManualOverrides(
  samples: PrioritizedSample[],
  overrides: PriorityOverride[],
): PrioritizedSample[] {
  if (overrides.length === 0) return samples

  const overrideMap = new Map(overrides.map((o) => [o.sampleId, o]))

  // Mark overridden samples and remove from the flowing list
  const overriddenIds = new Set(overrides.map((o) => o.sampleId))
  const flowing = samples
    .filter((s) => !overriddenIds.has(s.sampleId))
    .map((s) => ({ ...s, isManualOverride: false }))

  const overriddenSamples = samples
    .filter((s) => overriddenIds.has(s.sampleId))
    .map((s) => ({ ...s, isManualOverride: true }))

  // Build result array of flowing.length + overriddenSamples.length slots
  const totalLength = samples.length
  const result: (PrioritizedSample | null)[] = Array(totalLength).fill(null)

  // Pin overridden samples at their manual positions (clamped to valid range)
  const usedPositions = new Set<number>()
  for (const s of overriddenSamples) {
    const override = overrideMap.get(s.sampleId)!
    const pos = Math.min(Math.max(0, override.manualPosition), totalLength - 1)
    // If position is taken, find next available slot
    let target = pos
    while (usedPositions.has(target) && target < totalLength - 1) target++
    result[target] = s
    usedPositions.add(target)
  }

  // Fill remaining slots with flowing samples in order
  let flowIdx = 0
  for (let i = 0; i < totalLength; i++) {
    if (result[i] === null && flowIdx < flowing.length) {
      result[i] = flowing[flowIdx++]
    }
  }

  return result.filter((s): s is PrioritizedSample => s !== null)
}
