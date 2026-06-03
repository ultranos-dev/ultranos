/**
 * Skill Decay Notification System — Story 46.3
 *
 * Detects procedures that have transitioned from 'active' to 'decay_risk'
 * and produces gentle, dismissible notifications linking to micro-learning
 * modules (Story 46.2) where available.
 *
 * Notifications do NOT re-trigger until the next status transition, ensuring
 * the tech is not pestered for the same procedure repeatedly.
 *
 * No PHI: queries use technicianId + procedureRef (LOINC code) only.
 */

import { getDb } from '@/lib/db'
import { getMicroLearningModuleByProcedure } from '@/lib/db'
import { type DecayNotification } from '@/lib/competency-types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate which procedures have transitioned to 'decay_risk' or 'decayed'
 * since the last time notifications were generated, and create a new
 * DecayNotification record for each that doesn't already have an active
 * (non-dismissed) one.
 *
 * Returns the list of new notifications created.
 */
export async function checkForDecayNotifications(
  technicianId: string,
): Promise<DecayNotification[]> {
  const db = getDb()
  const now = new Date().toISOString()

  // Fetch all competency records for this tech
  const competencies = await db.procedure_competencies
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  // Filter to procedures that need attention
  const atRisk = competencies.filter(
    (c) => c.status === 'decay_risk' || c.status === 'decayed',
  )

  // Fetch any existing non-dismissed notifications for these procedures
  const existingNotifs = await db.decay_notifications
    .where('technicianId')
    .equals(technicianId)
    .filter((n) => !n.dismissed)
    .toArray()

  const existingRefs = new Set(existingNotifs.map((n) => n.procedureRef))

  const created: DecayNotification[] = []

  for (const competency of atRisk) {
    // Skip if there's already an active notification for this procedure
    if (existingRefs.has(competency.procedureRef)) continue

    // Compute days since last performance
    const daysSinceLast = competency.lastPerformedAt
      ? Math.floor(
          (new Date(now).getTime() -
            new Date(competency.lastPerformedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null

    // Look up linked micro-learning module (Story 46.2)
    let linkedModuleId: string | null = null
    try {
      const module = await getMicroLearningModuleByProcedure(
        competency.procedureRef,
      )
      linkedModuleId = module?.id ?? null
    } catch {
      // Non-fatal — notification is still useful without a module link
    }

    const notification: DecayNotification = {
      id: crypto.randomUUID(),
      technicianId,
      procedureRef: competency.procedureRef,
      procedureName: competency.procedureName,
      daysSinceLast: daysSinceLast ?? 0,
      linkedModuleId,
      createdAt: now,
      dismissed: false,
    }

    await db.decay_notifications.put(notification)
    created.push(notification)
  }

  return created
}

/**
 * Return all active (non-dismissed) decay notifications for a technician,
 * ordered newest first.
 */
export async function getActiveDecayNotifications(
  technicianId: string,
): Promise<DecayNotification[]> {
  const db = getDb()
  const all = await db.decay_notifications
    .where('technicianId')
    .equals(technicianId)
    .filter((n) => !n.dismissed)
    .toArray()

  return all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

/**
 * Dismiss a decay notification so it does not re-surface until the next
 * status transition.
 */
export async function dismissDecayNotification(id: string): Promise<void> {
  const db = getDb()
  await db.decay_notifications.update(id, { dismissed: true })
}

/**
 * Build the human-readable notification message for display.
 *
 * Example:
 *   "You haven't performed CBC in 52 days. Would you like to review the technique?"
 */
export function buildDecayMessage(
  procedureName: string,
  daysSinceLast: number,
): string {
  return `You haven't performed ${procedureName} in ${daysSinceLast} days. Would you like to review the technique?`
}
