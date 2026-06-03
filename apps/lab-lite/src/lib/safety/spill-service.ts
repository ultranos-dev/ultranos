/**
 * Spill Incident Service — Story 47.5
 *
 * CRUD operations for spill incidents with Dexie persistence and sync queueing.
 * All operations are offline-safe — no network calls.
 * No PHI: techId is an opaque practitioner ID. No patient data in any field.
 */

import { getDb, enqueueSyncEvent } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { getSpillProtocol } from '@/lib/safety/spill-protocols'
import { reportSpillAuditEvent } from '@/lib/audit-client'
import type { SpillIncident } from '@/types/spill-protocol'
import { SpillType } from '@/types/spill-protocol'

// Re-export types needed by callers
export type { SpillIncident }
export { SpillType }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `spill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Creates a new spill incident record in Dexie and emits an audit event.
 * Called as soon as the tech selects the spill type.
 */
export async function startSpillIncident(input: {
  spillType: SpillType
  location: string
  techId: string
}): Promise<SpillIncident> {
  const db = getDb()
  const protocol = getSpillProtocol(input.spillType)
  const now = new Date().toISOString()

  const incident: SpillIncident = {
    id: generateId(),
    spillType: input.spillType,
    riskTier: protocol.riskTier,
    occurredAt: now,
    location: input.location,
    stepsCompleted: [],
    completedAt: null,
    techId: input.techId,
    notes: '',
    hlcTimestamp: serializeHlc(hlc.now()),
    syncStatus: 'pending',
  }

  await db.spill_incidents.add(incident)

  reportSpillAuditEvent({
    action: 'SPILL_PROTOCOL_STARTED',
    incidentId: incident.id,
    spillType: incident.spillType,
    riskTier: incident.riskTier,
    location: incident.location,
    techId: input.techId,
  })

  return incident
}

/**
 * Records a step completion for a spill incident.
 * Idempotent — duplicate step numbers are ignored.
 */
export async function completeStep(
  incidentId: string,
  stepNumber: number,
  techId: string,
): Promise<void> {
  const db = getDb()
  const incident = await db.spill_incidents.get(incidentId)
  if (!incident) return

  if (incident.stepsCompleted.includes(stepNumber)) return

  const updatedSteps = [...incident.stepsCompleted, stepNumber]
  await db.spill_incidents.update(incidentId, { stepsCompleted: updatedSteps })

  reportSpillAuditEvent({
    action: 'SPILL_STEP_COMPLETED',
    incidentId,
    spillType: incident.spillType,
    riskTier: incident.riskTier,
    location: incident.location,
    techId,
    stepNumber,
  })
}

/**
 * Marks a spill incident as complete, saves optional notes, queues for Hub sync.
 */
export async function completeSpillIncident(
  incidentId: string,
  notes: string,
  techId: string,
): Promise<void> {
  const db = getDb()
  const incident = await db.spill_incidents.get(incidentId)
  if (!incident) return

  const now = new Date().toISOString()
  await db.spill_incidents.update(incidentId, {
    completedAt: now,
    notes,
    syncStatus: 'pending',
    hlcTimestamp: serializeHlc(hlc.now()),
  })

  await enqueueSyncEvent({
    resourceType: 'SPILL_INCIDENT',
    resourceId: incidentId,
    status: 'pending',
    payload: { ...incident, completedAt: now, notes },
    createdAt: now,
    lastAttemptAt: null,
    retryCount: 0,
  })

  reportSpillAuditEvent({
    action: 'SPILL_PROTOCOL_COMPLETED',
    incidentId,
    spillType: incident.spillType,
    riskTier: incident.riskTier,
    location: incident.location,
    techId,
  })
}

/**
 * Returns a spill incident by ID. Returns undefined if not found.
 */
export async function getSpillIncident(incidentId: string): Promise<SpillIncident | undefined> {
  const db = getDb()
  return db.spill_incidents.get(incidentId)
}

/**
 * Returns all spill incidents ordered by occurredAt descending (newest first).
 */
export async function getAllSpillIncidents(): Promise<SpillIncident[]> {
  const db = getDb()
  const all = await db.spill_incidents.orderBy('occurredAt').toArray()
  return all.reverse()
}
