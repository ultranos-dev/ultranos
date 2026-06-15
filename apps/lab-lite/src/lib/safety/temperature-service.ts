/**
 * Temperature logging service — reading persistence, excursion detection,
 * and resolution logic.
 *
 * Excursion detection algorithm (from story spec):
 *   1. Load location config (minTemp, maxTemp)
 *   2. If temperature < minTemp - 1 OR temperature > maxTemp + 1 → CRITICAL
 *   3. Else if temperature < minTemp OR temperature > maxTemp → WARNING
 *   4. Else → Normal reading
 *
 *   If CRITICAL:
 *     - Check for active excursion at this location
 *     - If exists: update peakTemperature (if worse), recalculate duration
 *     - If duration > 120 minutes: escalate to EXTENDED
 *     - If not exists: create new excursion record
 *
 *   If previous reading was excursion and current is normal:
 *     - Resolve active excursion (set endTime)
 *     - Keep flagged until acknowledged by staff
 */

import type {
  TemperatureReading,
  TemperatureLocation,
  TemperatureExcursion,
} from '@/types/temperature-monitoring'
import { TemperatureSource, ExcursionSeverity } from '@/types/temperature-monitoring'
import {
  addTemperatureReading,
  getTemperatureLocations,
  getOngoingExcursionForLocation,
  addExcursion,
  enqueueSyncEvent,
} from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export interface LogReadingInput {
  locationId: string
  temperatureCelsius: number
  source: TemperatureSource
  sensorId?: string
}

/**
 * Log a temperature reading, check for excursions, and return the reading
 * along with any excursion that was detected or updated.
 */
export async function logReading(
  input: LogReadingInput,
): Promise<{ reading: TemperatureReading; excursion: TemperatureExcursion | null }> {
  const locations = await getTemperatureLocations()
  const location = locations.find((l) => l.id === input.locationId)
  if (!location) {
    throw new Error(`Unknown temperature location: ${input.locationId}`)
  }

  const session = useAuthSessionStore.getState().session
  const now = new Date().toISOString()

  const reading: TemperatureReading = {
    id: crypto.randomUUID(),
    locationId: input.locationId,
    locationName: location.name,
    temperatureCelsius: input.temperatureCelsius,
    timestamp: now,
    source: input.source,
    sensorId: input.sensorId ?? null,
    recordedBy: session?.userId ?? 'unknown',
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  await addTemperatureReading(reading)

  // Enqueue for sync to Hub
  await enqueueSyncEvent({
    resourceType: 'TemperatureReading',
    resourceId: reading.id,
    payload: reading,
    hlcTimestamp: reading.hlcTimestamp,
  })

  const excursion = await checkExcursion(reading, location)

  return { reading, excursion }
}

/**
 * Check if a reading constitutes an excursion against the location's range.
 * Creates or updates excursion records as needed.
 */
export async function checkExcursion(
  reading: TemperatureReading,
  location: TemperatureLocation,
): Promise<TemperatureExcursion | null> {
  const temp = reading.temperatureCelsius
  const { minTemp, maxTemp } = location

  const isCritical = temp < minTemp - 1 || temp > maxTemp + 1
  const isWarning = !isCritical && (temp < minTemp || temp > maxTemp)
  const isNormal = !isCritical && !isWarning

  const existing = await getOngoingExcursionForLocation(reading.locationId)

  if (isNormal) {
    // Resolve any active excursion
    if (existing) {
      await resolveOngoingExcursion(existing, reading.timestamp)
    }
    return null
  }

  if (isCritical) {
    if (existing) {
      return updateExistingExcursion(existing, temp, reading.timestamp)
    }
    return createNewExcursion(reading, ExcursionSeverity.CRITICAL)
  }

  if (isWarning) {
    if (existing) {
      return updateExistingExcursion(existing, temp, reading.timestamp)
    }
    return createNewExcursion(reading, ExcursionSeverity.WARNING)
  }

  return null
}

/**
 * Calculate the duration in minutes from startTime to the given time (or now).
 */
export function getExcursionDuration(excursion: TemperatureExcursion): number {
  const start = new Date(excursion.startTime).getTime()
  const end = excursion.endTime
    ? new Date(excursion.endTime).getTime()
    : Date.now()
  return Math.round((end - start) / (1000 * 60))
}

/**
 * Mark an excursion as acknowledged with affected reagent list.
 */
export async function resolveExcursion(
  excursionId: string,
  resolution: { acknowledgedBy: string; affectedReagents: string[] },
): Promise<void> {
  const { acknowledgeExcursion } = await import('@/lib/db')
  await acknowledgeExcursion(
    excursionId,
    resolution.acknowledgedBy,
    resolution.affectedReagents,
  )
}

/**
 * Stub for reagent flagging — integration point for future reagent inventory story.
 * Returns list of reagent names stored at the location.
 */
export async function flagAffectedReagents(
  _locationId: string,
  _excursionId: string,
): Promise<string[]> {
  // Stub: will be replaced when reagent inventory story is implemented.
  // For now, returns empty — the operator must manually identify affected reagents.
  return []
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function createNewExcursion(
  reading: TemperatureReading,
  severity: ExcursionSeverity,
): Promise<TemperatureExcursion> {
  const excursion: TemperatureExcursion = {
    id: crypto.randomUUID(),
    locationId: reading.locationId,
    locationName: reading.locationName,
    startTime: reading.timestamp,
    endTime: null,
    peakTemperature: reading.temperatureCelsius,
    durationMinutes: null,
    severity,
    acknowledged: false,
    acknowledgedBy: null,
    affectedReagents: [],
  }
  await addExcursion(excursion)
  await enqueueSyncEvent({
    resourceType: 'TemperatureExcursion',
    resourceId: excursion.id,
    payload: excursion,
    hlcTimestamp: serializeHlc(hlc.now()),
  })
  return excursion
}

async function updateExistingExcursion(
  existing: TemperatureExcursion,
  currentTemp: number,
  currentTime: string,
): Promise<TemperatureExcursion> {
  const peakTemperature = Math.abs(currentTemp) > Math.abs(existing.peakTemperature)
    ? currentTemp
    : existing.peakTemperature

  const durationMinutes = Math.round(
    (new Date(currentTime).getTime() - new Date(existing.startTime).getTime()) / (1000 * 60),
  )

  const severity = durationMinutes > 120
    ? ExcursionSeverity.EXTENDED
    : existing.severity

  const updated: TemperatureExcursion = {
    ...existing,
    peakTemperature,
    durationMinutes,
    severity,
  }

  await addExcursion(updated) // put() upserts by id
  return updated
}

async function resolveOngoingExcursion(
  excursion: TemperatureExcursion,
  endTime: string,
): Promise<void> {
  const durationMinutes = Math.round(
    (new Date(endTime).getTime() - new Date(excursion.startTime).getTime()) / (1000 * 60),
  )

  const resolved: TemperatureExcursion = {
    ...excursion,
    endTime,
    durationMinutes,
  }

  await addExcursion(resolved) // put() upserts by id
}
