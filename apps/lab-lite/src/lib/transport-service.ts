/**
 * Transport Service — manages courier transport sessions for sample tracking.
 *
 * Core workflow:
 *   1. startTransport(): creates session, records custody pickup events for each sample
 *   2. recordDelivery(): records arrival, runs stability checks, attaches flags
 *   3. attachPreAnalyticalFlag(): marks a sample with a transport flag for tech acknowledgment
 *   4. getActiveTransportsForCourier(): returns in-transit sessions for a courier
 *
 * Story 42.3 integration: transport pickup/delivery events are CustodyEvent records
 * and appear in the same CustodyTimeline as other sample events.
 *
 * CLAUDE.md Rule #1: No PHI in any log, error, or audit metadata. Only opaque IDs.
 * CLAUDE.md Rule #6: Every access to sample data emits an audit event.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — uuid has no bundled type declarations in this workspace
import { hlc, serializeHlc } from '@/lib/hlc'
import {
  createTransportSession,
  getTransportSession,
  updateTransportSession,
  getTransportsByCourier,
  getDb,
} from '@/lib/db'
import { reportTransportAuditEvent } from '@/lib/audit-client'
import { checkStabilityWindows } from '@/lib/stability-monitor'
import type { TransportSession, TransportFlag, StartTransportInput, DeliveryInput } from '@/types/transport'
import type { CustodyEvent } from '@/types/custody-event'

// ---------------------------------------------------------------------------
// startTransport
// ---------------------------------------------------------------------------

/**
 * Create a new transport session and record custody pickup events for each sample.
 *
 * AC 1: A transport session is created with status 'in-transit'.
 * AC 7: Each sample gets a 'transport-pickup' CustodyEvent for timeline continuity.
 *
 * Never throws on audit failure — audit errors are swallowed internally by
 * reportTransportAuditEvent() (consistent with all other audit callers in this codebase).
 */
export async function startTransport(input: StartTransportInput): Promise<TransportSession> {
  const sessionId = crypto.randomUUID()
  // P1: Use ISO 8601 wall-clock timestamps for pickup/delivery — these are used for
  // stability window calculations (Date.parse). HLC is used for CustodyEvent.timestamp
  // (causal ordering for sync). Mixing them caused Date.parse to return NaN on HLC strings.
  const pickupTimestamp = new Date().toISOString()

  const session: TransportSession = {
    id: sessionId,
    courierId: input.courierId,
    originLocationId: input.originLocationId,
    destinationLocationId: input.destinationLocationId,
    status: 'in-transit',
    pickupTimestamp,
    deliveryTimestamp: null,
    pickupTemperature: input.pickupTemperature ?? null,
    deliveryTemperature: null,
    sampleIds: input.sampleIds,
    sampleCount: input.sampleIds.length,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: input.estimatedTransitMinutes ?? null,
    meta: {
      lastUpdated: new Date().toISOString(),
      versionId: '1',
    },
    _ultranos: {
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    },
  }

  // P7: Wrap session creation and custody events in a transaction to prevent partial state.
  // If any custody_events.put fails (e.g. quota exceeded), the whole operation rolls back.
  const db = getDb()
  await db.transaction('rw', [db.transport_sessions, db.custody_events], async () => {
    await db.transport_sessions.add(session)

    // Create a custody pickup event for each sample (Story 42.3 timeline integration)
    for (const sampleId of input.sampleIds) {
      const custodyEvent: CustodyEvent = {
        id: crypto.randomUUID(),
        sampleId,
        eventType: 'transport-pickup',
        // P17: Both actor fields set to courierId — simplified model for courier-initiated transport.
        // Lab-actor handoff tracking (origin lab actor → courier) deferred pending Epic 54 auth model
        // where the sending lab's practitioner ID will be available in the transport context.
        fromActorId: input.courierId,
        toActorId: input.courierId,
        timestamp: serializeHlc(hlc.now()), // HLC for causal ordering in the timeline
        location: input.originLocationId,
        transportSessionId: sessionId,
        temperature: input.pickupTemperature ?? undefined,
      }
      await db.custody_events.put(custodyEvent)
    }
  })

  // Emit audit — CLAUDE.md Rule #6: every access to sample data emits an audit event
  reportTransportAuditEvent({
    action: 'TRANSPORT_STARTED',
    transportSessionId: sessionId,
    courierId: input.courierId,
    sampleCount: input.sampleIds.length,
  })

  return session
}

// ---------------------------------------------------------------------------
// recordDelivery
// ---------------------------------------------------------------------------

/**
 * Record the delivery of a transport session.
 *
 * AC 2: Session is updated to 'delivered' (or 'flagged' if stability checks fire).
 * AC 3: Stability windows are checked for every sample in the session.
 * AC 4: If conditionAtDelivery is 'temperature-excursion', flags are generated
 *        for all samples in addition to any stability flags.
 * AC 5: Throws if session is not found.
 */
export async function recordDelivery(
  sessionId: string,
  input: DeliveryInput,
): Promise<TransportSession> {
  const existing = await getTransportSession(sessionId)
  if (!existing) {
    // Opaque error — no session ID or PHI in the message visible externally
    throw new Error('Transport session not found')
  }

  // P6: Idempotency guard — if already delivered or flagged, return without side effects.
  // In offline-first with retry, this function may be called more than once for the same session.
  if (existing.status !== 'in-transit') {
    return existing
  }

  // P1: ISO 8601 wall-clock timestamp for stability calculations (not HLC — see startTransport)
  const deliveryTimestamp = new Date().toISOString()

  // P12: versionId increment — move || 1 outside addition so '0' → '1', not '0' → '2'.
  const nextVersionId = String((parseInt(existing.meta.versionId, 10) + 1) || 1)

  // Build the updated session state for stability checking
  const updatedSession: TransportSession = {
    ...existing,
    status: 'delivered',
    deliveryTimestamp,
    deliveryTemperature: input.deliveryTemperature ?? null,
    conditionAtDelivery: input.conditionAtDelivery,
    meta: {
      lastUpdated: new Date().toISOString(),
      versionId: nextVersionId,
    },
  }

  // Load specimens for stability check — read BEFORE the write transaction
  const db = getDb()
  const specimensRaw = await db.samples.bulkGet(existing.sampleIds)
  // bulkGet may return undefined slots for missing specimens — filter those out.
  // P13: Missing specimens are excluded from stability checks (offline tolerance — specimen
  // may not yet be accessioned at this location). The missing count is included in the audit
  // event so the receiving tech can investigate.
  const specimens = specimensRaw.filter((s): s is NonNullable<typeof s> => s != null)
  const missingSpecimenCount = existing.sampleIds.length - specimens.length

  // Run stability window check
  const stabilityFlags = checkStabilityWindows(updatedSession, specimens)

  // P5: Generate condition flags for both 'temperature-excursion' AND 'damaged' conditions.
  // Previously only 'temperature-excursion' was handled; damaged samples passed through silently.
  const conditionFlags: TransportFlag[] =
    (input.conditionAtDelivery === 'temperature-excursion' || input.conditionAtDelivery === 'damaged')
      ? existing.sampleIds.map((sampleId) => {
          const specimen = specimens.find((s) => s.id === sampleId)
          const labSampleId = specimen?._ultranos.labSampleId ?? sampleId
          const message = input.conditionAtDelivery === 'damaged'
            ? `Sample ${labSampleId} flagged: damaged condition reported at delivery.`
            : `Sample ${labSampleId} flagged: temperature excursion reported at delivery.`
          return {
            sampleId,
            labSampleId,
            flagType: input.conditionAtDelivery as 'temperature-excursion' | 'damaged',
            message,
            timestamp: new Date().toISOString(),
          }
        })
      : []

  // Merge flags (stability-exceeded first, then condition flags)
  // De-duplicate by sampleId+flagType to avoid double-flagging
  const allFlagsMap = new Map<string, TransportFlag>()
  for (const flag of [...stabilityFlags, ...conditionFlags]) {
    const key = `${flag.sampleId}:${flag.flagType}`
    if (!allFlagsMap.has(key)) {
      allFlagsMap.set(key, flag)
    }
  }
  const allFlags = Array.from(allFlagsMap.values())

  // Escalate status to 'flagged' if any flags were generated
  if (allFlags.length > 0) {
    updatedSession.status = 'flagged'
    updatedSession.flags = allFlags
  }

  // P7: Wrap all writes in a transaction to prevent partial state on IndexedDB failure.
  // Session update, custody events, and flag attachments are atomic.
  await db.transaction('rw', [db.transport_sessions, db.custody_events, db.samples], async () => {
    await updateTransportSession(sessionId, {
      status: updatedSession.status,
      deliveryTimestamp: updatedSession.deliveryTimestamp,
      deliveryTemperature: updatedSession.deliveryTemperature,
      conditionAtDelivery: updatedSession.conditionAtDelivery,
      flags: updatedSession.flags,
      meta: updatedSession.meta,
    })

    // Create custody delivery events for each sample (Story 42.3 timeline integration)
    for (const sampleId of existing.sampleIds) {
      const custodyEvent: CustodyEvent = {
        id: crypto.randomUUID(),
        sampleId,
        eventType: 'transport-delivery',
        // P17: See startTransport for actor model explanation.
        fromActorId: existing.courierId,
        toActorId: existing.courierId,
        timestamp: serializeHlc(hlc.now()), // HLC for causal ordering
        location: existing.destinationLocationId,
        transportSessionId: sessionId,
        temperature: input.deliveryTemperature ?? undefined,
      }
      await db.custody_events.put(custodyEvent)
    }

    // Attach pre-analytical flags to individual sample records
    for (const flag of allFlags) {
      await attachPreAnalyticalFlag(flag.sampleId, flag)
    }
  })

  // Emit audit events — CLAUDE.md Rule #6
  if (allFlags.length > 0) {
    reportTransportAuditEvent({
      action: 'TRANSPORT_STABILITY_FLAG',
      transportSessionId: sessionId,
      courierId: existing.courierId,
      sampleCount: existing.sampleCount,
      flagCount: allFlags.length,
      flagTypes: [...new Set(allFlags.map((f) => f.flagType))],
      ...(missingSpecimenCount > 0 ? { missingSpecimenCount } : {}),
    })
  }

  reportTransportAuditEvent({
    action: 'TRANSPORT_DELIVERED',
    transportSessionId: sessionId,
    courierId: existing.courierId,
    sampleCount: existing.sampleCount,
    ...(missingSpecimenCount > 0 ? { missingSpecimenCount } : {}),
  })

  return updatedSession
}

// ---------------------------------------------------------------------------
// attachPreAnalyticalFlag
// ---------------------------------------------------------------------------

/**
 * Append a TransportFlag to a specimen's _ultranos.transportFlags array.
 *
 * Offline-tolerant: if the specimen is not in the local IndexedDB (not yet
 * accessioned at the satellite, or evicted from cache), returns silently
 * rather than throwing. The flag is still recorded on the TransportSession.
 *
 * AC 5 (offline tolerance): must not throw if specimen not found.
 */
export async function attachPreAnalyticalFlag(
  sampleId: string,
  flag: TransportFlag,
): Promise<void> {
  const db = getDb()
  const specimen = await db.samples.get(sampleId)
  if (!specimen) {
    // Offline tolerance — specimen may not be in local cache yet
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ultranos = specimen._ultranos as any
  const existing: TransportFlag[] = Array.isArray(ultranos.transportFlags)
    ? ultranos.transportFlags
    : []

  const updatedFlags = [...existing, flag]
  // Use Dexie dot-path update syntax; cast to any to satisfy strict FhirSpecimen type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.samples.update(sampleId, { '_ultranos.transportFlags': updatedFlags } as any)
}

// ---------------------------------------------------------------------------
// getActiveTransportsForCourier
// ---------------------------------------------------------------------------

/**
 * Return all 'in-transit' sessions for a given courier.
 * Used by the courier dashboard to show pending deliveries.
 */
export async function getActiveTransportsForCourier(
  courierId: string,
): Promise<TransportSession[]> {
  const sessions = await getTransportsByCourier(courierId)
  return sessions.filter((s) => s.status === 'in-transit')
}
