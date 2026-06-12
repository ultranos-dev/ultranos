/**
 * Learning Trigger Engine — Story 46.2
 *
 * Evaluates whether a contextual micro-learning notification should fire
 * when a technician opens a result entry form for a procedure.
 *
 * Three trigger conditions (checked in priority order):
 *   1. first_time — tech has never performed this procedure
 *   2. skill_decay — last performance was >N days ago (default 30)
 *   3. new_sop — there's an unacknowledged SOP update for this procedure
 *
 * No patient data is involved — queries are by technicianId + procedureRef only.
 */

import {
  getDb,
  getMicroLearningModuleByProcedure,
} from '@/lib/db'
import type { TriggerResult } from '@/lib/micro-learning-types'

const DEFAULT_DECAY_DAYS = 30
const DEFAULT_PASS_THRESHOLD = 0.66

/**
 * Evaluate triggers for the given technician + procedure.
 * Returns a TriggerResult describing which trigger fired, or null if no trigger applies.
 *
 * Call this when a tech opens a result entry form or begins a new sample for a procedure.
 */
export async function evaluateTriggers(
  technicianId: string,
  procedureRef: string,
): Promise<TriggerResult | null> {
  const db = getDb()

  // Requires a module to exist for this procedure; no module → no trigger
  const module = await getMicroLearningModuleByProcedure(procedureRef)
  if (!module) return null

  // Query all results entered by this tech for this procedure
  const results = await db.lab_results
    .where('enteredBy')
    .equals(technicianId)
    .filter((r) => r.loincCode === procedureRef)
    .toArray()

  const base: Omit<TriggerResult, 'type'> = {
    moduleId: module.id,
    procedureName: module.procedureName,
    durationMinutes: module.durationMinutes,
  }

  // --- Trigger 1: first_time ---
  if (results.length === 0) {
    return { type: 'first_time', ...base }
  }

  // --- Trigger 2: skill_decay ---
  const decayDays = module.skillDecayDays ?? DEFAULT_DECAY_DAYS
  // Filter out null/undefined enteredAt values before sorting.
  // String(null) → "null" sorts lexicographically after ISO dates, so a record
  // with a null timestamp would become the "latest" entry, making dateDiffInDays
  // return NaN and silently suppressing the skill_decay trigger.
  const latestEntry = results
    .map((r) => r.enteredAt)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort()
    .at(-1)

  if (!latestEntry) {
    // All records had null timestamps — treat as first_time.
    return { type: 'first_time', ...base }
  }

  const daysSinceLast = dateDiffInDays(latestEntry, new Date().toISOString())
  if (daysSinceLast > decayDays) {
    return { type: 'skill_decay', ...base }
  }

  // --- Trigger 3: new_sop ---
  if (module.relatedSopId) {
    const sopTrigger = await checkSopTrigger(
      technicianId,
      module.relatedSopId,
      base,
    )
    if (sopTrigger) return sopTrigger
  }

  return null
}

async function checkSopTrigger(
  technicianId: string,
  sopId: string,
  base: Omit<TriggerResult, 'type'>,
): Promise<TriggerResult | null> {
  const db = getDb()

  const sop = await db.sops.get(sopId)
  if (!sop || sop.status !== 'active') return null

  const latestAck = await db.sop_acknowledgments
    .where('[sopId+technicianId]')
    .equals([sopId, technicianId])
    .filter((a) => a.sopVersion === sop.version)
    .first()

  if (!latestAck) {
    return { type: 'new_sop', ...base }
  }
  return null
}

/** Returns the number of whole days between two ISO 8601 timestamps. */
function dateDiffInDays(earlier: string, later: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.floor(
    (new Date(later).getTime() - new Date(earlier).getTime()) / msPerDay,
  )
}

/**
 * Calculate assessment score as a ratio (0–1).
 * @param correct  Number of correct answers
 * @param total    Total number of questions
 */
export function calculateAssessmentScore(correct: number, total: number): number {
  if (total === 0) return 0
  return correct / total
}

/**
 * Determine pass/fail based on score ratio and threshold.
 * Default threshold is 66% (2/3 correct).
 */
export function isAssessmentPassed(
  correct: number,
  total: number,
  threshold = DEFAULT_PASS_THRESHOLD,
): boolean {
  return calculateAssessmentScore(correct, total) >= threshold
}
