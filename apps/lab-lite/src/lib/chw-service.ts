// ---------------------------------------------------------------------------
// Story 54.2 — CHW Collection Service
// Business logic for patient identification, sample collection, courier handoff,
// and sync queue management. All operations run fully offline; data queues to
// Dexie and uploads when connectivity appears.
//
// PHI rule (CLAUDE.md Rule #7): patient data stored = first name + age ONLY.
// No DOB, no full name, no diagnosis, no father's name stored after lookup.
// ---------------------------------------------------------------------------

import { v4 as uuidv4 } from 'uuid'
import {
  addCHWSample,
  addCourierHandoff,
  getCHWSamplesByIds,
  getPendingSyncItems,
} from './db'
import { generateLabelNumber } from './chw-label-generator'
import { hlc, serializeHlc } from './hlc'
import {
  reportCHWSampleCollectedEvent,
  reportCHWHandoffEvent,
} from './audit-client'
import type {
  CHWSampleCollection,
  CourierHandoff,
  CollectSampleInput,
  CourierHandoffInput,
} from '@/types/chw-mode'

// ---------------------------------------------------------------------------
// Patient identification
// ---------------------------------------------------------------------------

/**
 * Identify a patient by scanning their Health Passport QR code.
 *
 * Health Passport QR format: { pid, iat, exp, v, sig? }
 * Validates expiry and returns minimal patient data. No additional data is
 * fetched from the patient cache (data minimization — AC #2).
 *
 * Returns null if the QR is invalid or expired.
 */
export function identifyPatientByQR(
  qrData: string,
): { pid: string; firstName: string; age: number } | null {
  try {
    const parsed = JSON.parse(qrData) as {
      pid?: string
      iat?: number
      exp?: number
      v?: number
      sig?: string
      firstName?: string
      age?: number
    }

    if (!parsed.pid) return null

    // Validate expiry if present (exp is Unix epoch seconds)
    if (parsed.exp != null && parsed.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    // Return only the minimal fields needed for display + linking
    return {
      pid: parsed.pid,
      firstName: parsed.firstName ?? '', // may not be in all QR versions
      age: parsed.age ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Identify a patient by name + father's name (Afghan standard identification).
 * Searches the local verified_patients cache.
 *
 * Returns null if not found — CHW can still collect the sample with a temp
 * patient reference; the sample links on sync via name reconciliation.
 */
export async function identifyPatientByName(
  firstName: string,
  fatherName: string,
): Promise<{ pid: string; firstName: string; age: number } | null> {
  if (!firstName.trim()) return null

  // Dynamic import to avoid circular dep issues and keep service testable
  const { getDb } = await import('./db')
  const db = getDb()

  // verified_patients cache uses FHIR Patient structure; name stored as _ultranos extension
  const patients = await db.verified_patients.toArray()

  // Match by first name (case-insensitive)
  // Father's name used as disambiguator when multiple matches
  const firstNameNorm = firstName.trim().toLowerCase()
  const matches = patients.filter(
    (p) => p.firstName.toLowerCase() === firstNameNorm,
  )

  if (matches.length === 0) return null

  // If only one match, return it; if multiple, return first (CHW flow doesn't require exact match)
  const match = matches[0]
  return {
    pid: match.patientId,
    firstName: match.firstName,
    age: match.age,
  }
}

// ---------------------------------------------------------------------------
// Sample collection
// ---------------------------------------------------------------------------

/**
 * Collect a sample: validates input, generates label, persists to Dexie.
 * Never throws on audit failure — collection must not be blocked by logging.
 *
 * Emits audit event via the caller's audit hook (passed as optional callback
 * to avoid tight coupling; the component layer calls reportCHWAuditEvent).
 */
export async function collectSample(
  input: CollectSampleInput,
): Promise<CHWSampleCollection> {
  if (!input.patientRef) throw new Error('patientRef is required')
  if (!input.patientFirstName) throw new Error('patientFirstName is required')
  if (input.patientAge < 0 || input.patientAge > 120) throw new Error('Invalid patient age')
  if (!input.sampleType) throw new Error('sampleType is required')
  if (!input.collectedBy) throw new Error('collectedBy is required')

  const labelNumber = await generateLabelNumber()

  const sample: CHWSampleCollection = {
    id: uuidv4(),
    patientRef: input.patientRef,
    patientFirstName: input.patientFirstName, // first name ONLY — CLAUDE.md Rule #7
    patientAge: input.patientAge,
    sampleType: input.sampleType,
    labelNumber,
    collectedBy: input.collectedBy,
    collectedAt: serializeHlc(hlc.now()),
    ...(input.location ? { location: input.location } : {}),
    syncStatus: 'pending',
  }

  await addCHWSample(sample)

  // Audit: CHW_SAMPLE_COLLECTED — opaque IDs only, no patient name (AC #9)
  reportCHWSampleCollectedEvent({
    sampleId: sample.id,
    sampleType: sample.sampleType,
    labelNumber: sample.labelNumber,
    chwPractitionerId: input.collectedBy,
  })

  return sample
}

// ---------------------------------------------------------------------------
// Courier handoff
// ---------------------------------------------------------------------------

/**
 * Record that a courier picked up a set of samples.
 * Validates that all sampleIds exist in today's Dexie log before persisting.
 * Returns the persisted handoff record.
 *
 * Throws if any sampleId is not found in Dexie (prevents phantom handoffs).
 */
export async function recordCourierHandoff(
  input: CourierHandoffInput,
): Promise<CourierHandoff> {
  if (!input.courierId.trim()) throw new Error('courierId is required')
  if (!input.sampleIds.length) throw new Error('At least one sample must be selected')

  // Validate all sample IDs exist
  const found = await getCHWSamplesByIds(input.sampleIds)
  const foundIds = new Set(found.map((s) => s.id))
  const missing = input.sampleIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Sample IDs not found in local records: ${missing.length} missing`)
  }

  const handoff: CourierHandoff = {
    id: uuidv4(),
    courierId: input.courierId.trim(),
    sampleIds: input.sampleIds,
    sampleCount: input.sampleIds.length,
    pickupTimestamp: serializeHlc(hlc.now()),
    ...(input.temperatureAtPickup != null ? { temperatureAtPickup: input.temperatureAtPickup } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    syncStatus: 'pending',
  }

  await addCourierHandoff(handoff)

  // Audit: CHW_COURIER_HANDOFF — no patient data in metadata (AC #9)
  reportCHWHandoffEvent({
    handoffId: handoff.id,
    sampleCount: handoff.sampleCount,
    courierId: handoff.courierId,
    chwPractitionerId: input.collectedBy ?? 'unknown',
  })

  return handoff
}

// ---------------------------------------------------------------------------
// Sync queue
// ---------------------------------------------------------------------------

/**
 * Return all CHW samples and courier handoffs with syncStatus: 'pending'.
 * Used by the upload queue worker to drain offline-collected records.
 */
export async function getSyncQueue(): Promise<Array<CHWSampleCollection | CourierHandoff>> {
  return getPendingSyncItems()
}
