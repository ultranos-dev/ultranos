/**
 * network-service.ts — Lab Network Service
 * Story 54.1 / Task 3
 *
 * Manages lab location lifecycle (add, update, deactivate, mode changes)
 * and lightweight routing records for samples/results.
 * No PHI involved — locationId and sampleId/resultId are opaque identifiers.
 */

import type { LabLocation, CreateLocationInput } from '@/types/lab-network'
import { putLocation, getLocationById } from '@/lib/db'
import { reportNetworkAuditEvent } from '@/lib/audit-client'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// addSatelliteLocation
// ---------------------------------------------------------------------------

/**
 * Create and persist a new lab location.
 * Validates that satellite locations have a parentLabId.
 */
export async function addSatelliteLocation(input: CreateLocationInput): Promise<LabLocation> {
  if (!input.name || input.name.trim() === '') {
    throw new Error('Location name must not be empty')
  }
  if (input.type === 'satellite' && !input.parentLabId) {
    throw new Error('Satellite locations must have a parentLabId')
  }

  const session = useAuthSessionStore.getState().session
  const now = new Date().toISOString()

  const location: LabLocation = {
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    mode: input.mode,
    status: 'active',
    ...(input.address ? { address: input.address } : {}),
    ...(input.coordinates ? { coordinates: input.coordinates } : {}),
    ...(input.parentLabId ? { parentLabId: input.parentLabId } : {}),
    settings: input.settings ?? {},
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
    _ultranos: {
      createdAt: now,
      hlcTimestamp: serializeHlc(hlc.now()),
    },
  }

  await putLocation(location)

  reportNetworkAuditEvent({
    action: 'NETWORK_LOCATION_ADDED',
    locationId: location.id,
    actorId: session?.userId ?? 'unknown',
    timestamp: now,
  })

  return location
}

// ---------------------------------------------------------------------------
// updateLocation
// ---------------------------------------------------------------------------

/**
 * Apply partial updates to an existing location.
 * Updates meta timestamps and persists.
 */
export async function updateLocation(id: string, updates: Partial<LabLocation>): Promise<LabLocation> {
  const existing = await getLocationById(id)
  if (!existing) {
    throw new Error('Location not found: ' + id)
  }

  const session = useAuthSessionStore.getState().session
  const now = new Date().toISOString()

  const updated: LabLocation = {
    ...existing,
    ...updates,
    id: existing.id, // id is immutable
    meta: {
      lastUpdated: now,
      versionId: String((parseInt(existing.meta.versionId, 10) || 1) + 1),
    },
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: serializeHlc(hlc.now()),
    },
  }

  await putLocation(updated)

  reportNetworkAuditEvent({
    action: 'NETWORK_LOCATION_UPDATED',
    locationId: id,
    actorId: session?.userId ?? 'unknown',
    timestamp: now,
  })

  return updated
}

// ---------------------------------------------------------------------------
// deactivateLocation
// ---------------------------------------------------------------------------

/**
 * Mark a location as inactive.
 */
export async function deactivateLocation(id: string, actorId: string): Promise<void> {
  const existing = await getLocationById(id)
  if (!existing) {
    throw new Error('Location not found: ' + id)
  }

  const now = new Date().toISOString()

  const updated: LabLocation = {
    ...existing,
    status: 'inactive',
    meta: {
      lastUpdated: now,
      versionId: String((parseInt(existing.meta.versionId, 10) || 1) + 1),
    },
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: serializeHlc(hlc.now()),
    },
  }

  await putLocation(updated)

  reportNetworkAuditEvent({
    action: 'NETWORK_LOCATION_DEACTIVATED',
    locationId: id,
    actorId,
    timestamp: now,
  })
}

// ---------------------------------------------------------------------------
// setLocationMode
// ---------------------------------------------------------------------------

/**
 * Switch a location between full-service and collection-only mode.
 */
export async function setLocationMode(
  id: string,
  mode: 'full' | 'collection-only',
  actorId: string,
): Promise<void> {
  const existing = await getLocationById(id)
  if (!existing) {
    throw new Error('Location not found: ' + id)
  }

  const now = new Date().toISOString()

  const updated: LabLocation = {
    ...existing,
    mode,
    meta: {
      lastUpdated: now,
      versionId: String((parseInt(existing.meta.versionId, 10) || 1) + 1),
    },
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: serializeHlc(hlc.now()),
    },
  }

  await putLocation(updated)

  reportNetworkAuditEvent({
    action: 'NETWORK_MODE_CHANGED',
    locationId: id,
    actorId,
    timestamp: now,
    details: { mode },
  })
}

// ---------------------------------------------------------------------------
// routeSampleToMainLab
// ---------------------------------------------------------------------------

/**
 * Record that a sample is being routed from a satellite to the main lab.
 * Emits an audit event only — actual sample status update happens via sync engine.
 */
export async function routeSampleToMainLab(sampleId: string, originLocationId: string): Promise<void> {
  const session = useAuthSessionStore.getState().session
  const now = new Date().toISOString()

  reportNetworkAuditEvent({
    action: 'SAMPLE_ROUTED_TO_MAIN',
    locationId: originLocationId,
    actorId: session?.userId ?? 'unknown',
    timestamp: now,
    details: { sampleId },
  })
}

// ---------------------------------------------------------------------------
// routeResultToSatellite
// ---------------------------------------------------------------------------

/**
 * Record that a result is being routed from the main lab to a satellite.
 * Emits an audit event only — actual result delivery happens via sync engine.
 */
export async function routeResultToSatellite(resultId: string, originLocationId: string): Promise<void> {
  const session = useAuthSessionStore.getState().session
  const now = new Date().toISOString()

  reportNetworkAuditEvent({
    action: 'RESULT_ROUTED_TO_SATELLITE',
    locationId: originLocationId,
    actorId: session?.userId ?? 'unknown',
    timestamp: now,
    details: { resultId },
  })
}
