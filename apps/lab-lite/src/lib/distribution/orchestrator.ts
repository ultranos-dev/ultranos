/**
 * Story 42.6 — Write-Once, Distribute-Many: Distribution Orchestrator
 *
 * On ResultReleasedEvent:
 *   1. Build all four projections.
 *   2. Enqueue each as a separate DistributionQueueEntry.
 *   3. Emit DISTRIBUTION_ENQUEUED audit event per entry.
 *
 * Priority assignment:
 *   critical  → priority 1
 *   abnormal  → priority 2
 *   normal    → priority 3
 *
 * Separation of concerns:
 *   - Logbook + Stats projections are local-only (Dexie writes, no Hub needed).
 *   - OPD-Lite + Patient-Lite projections require Hub connectivity.
 *   The drain worker (drain-worker.ts) handles the actual delivery.
 *
 * Gate: distribution fires ONLY when flagLevel is set AND authorizedBy is set.
 * This mirrors the approveResult() guard — preliminary/error results are never
 * distributed.
 */

import { addDistributionQueueEntry } from '../db'
import type { DistributionDestination } from '../db'
import type { ResultReleasedEvent } from '../authorization-actions'
import {
  buildOpdProjection,
  buildPatientProjection,
  buildLogbookProjection,
  buildStatsProjection,
} from './projections'

export type DistributionAuditFn = (payload: {
  action: 'DISTRIBUTION_ENQUEUED'
  reportId: string
  destination: DistributionDestination
  priority: number
  actorId: string
  timestamp: string
}) => void

/** Default audit function using the lab-lite audit-client. */
export async function createDefaultAuditFn(): Promise<DistributionAuditFn> {
  const { reportDistributionEvent } = await import('../audit-client')
  return (payload) => {
    reportDistributionEvent({
      action: payload.action,
      reportId: payload.reportId,
      destination: payload.destination,
      priority: payload.priority,
      actorId: payload.actorId,
      timestamp: payload.timestamp,
    })
  }
}

export interface OrchestratorDependencies {
  onAuditEvent: DistributionAuditFn
  labId?: string
  labName?: string
}

const PRIORITY_MAP: Record<'normal' | 'abnormal' | 'critical', number> = {
  critical: 1,
  abnormal: 2,
  normal: 3,
}

/**
 * Enqueue all four distribution projections for a released result.
 *
 * Returns an array of the created queue entry IDs.
 * Never throws — distribution failures must not block authorization callers.
 */
export async function distributeResult(
  event: ResultReleasedEvent,
  deps: OrchestratorDependencies,
): Promise<number[]> {
  // Safety gate: only distribute properly authorized results
  if (!event.authorizedBy || !event.reportId) {
    console.warn('[orchestrator] distributeResult called without authorizedBy or reportId — skipping')
    return []
  }

  const priority = PRIORITY_MAP[event.flagLevel]
  const now = new Date().toISOString()
  const createdIds: number[] = []

  const destinations: Array<{
    destination: DistributionDestination
    payload: unknown
  }> = [
    {
      destination: 'OPD_LITE',
      payload: buildOpdProjection(event, deps.labId),
    },
    {
      destination: 'PATIENT_LITE',
      payload: buildPatientProjection({ ...event, labName: deps.labName ?? event.labName }),
    },
    {
      destination: 'LOGBOOK',
      payload: buildLogbookProjection(event),
    },
    {
      destination: 'STATS',
      payload: buildStatsProjection(event),
    },
  ]

  for (const { destination, payload } of destinations) {
    try {
      const id = await addDistributionQueueEntry({
        reportId: event.reportId,
        destination,
        payload: JSON.stringify(payload),
        status: 'pending',
        retryCount: 0,
        lastAttemptAt: null,
        createdAt: now,
        priority,
      })
      createdIds.push(id)

      deps.onAuditEvent({
        action: 'DISTRIBUTION_ENQUEUED',
        reportId: event.reportId,
        destination,
        priority,
        actorId: event.authorizedBy,
        timestamp: now,
      })
    } catch (err) {
      // Log shape of error only — no PHI
      console.error(
        `[orchestrator] Failed to enqueue ${destination} for report [redacted]: ${(err as Error).message}`,
      )
    }
  }

  return createdIds
}
