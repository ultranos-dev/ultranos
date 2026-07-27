// ---------------------------------------------------------------------------
// Story 54.2 — CHW Collection Service
// Business logic for patient identification, sample collection, courier handoff,
// and sync queue management. All operations run fully offline; data queues to
// Dexie and uploads when connectivity appears.
//
// PHI rule (CLAUDE.md Rule #7): patient data stored = first name + age ONLY.
// No DOB, no full name, no diagnosis, no father's name stored after lookup.
// ---------------------------------------------------------------------------

import {
  addCHWSampleAtomic,
  addCourierHandoff,
  getCHWSamplesByIds,
  getPendingSyncItems,
} from './db'
import { hlc, serializeHlc } from './hlc'
import { verifyQrOffline } from './offline-verify'
import {
  reportCHWSampleCollectedEvent,
  reportCHWHandoffEvent,
  reportCHWPatientIdentifiedEvent,
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
 * When a `sig` field is present the QR payload is verified offline against
 * cached Ed25519 practitioner keys (verifyQrOffline). QRs without a sig field
 * are accepted as-is (legacy devices that have not yet been upgraded).
 *
 * Returns null if the QR is invalid, expired, or has an invalid signature.
 * Emits CHW_PATIENT_IDENTIFIED audit event on success (AC #9).
 */
export async function identifyPatientByQR(
  qrData: string,
  chwPractitionerId: string,
): Promise<{ pid: string; firstName: string; age: number } | null> {
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

    // Verify Ed25519 signature when present (F12)
    if (parsed.sig) {
      const result = await verifyQrOffline(parsed as Parameters<typeof verifyQrOffline>[0])
      if (!result.valid) return null
    }

    const patient = {
      pid: parsed.pid,
      firstName: parsed.firstName ?? '',
      age: parsed.age ?? 0,
    }

    // Audit: CHW_PATIENT_IDENTIFIED — opaque patientRef only (AC #9)
    reportCHWPatientIdentifiedEvent({
      patientRef: patient.pid,
      identificationMethod: 'qr',
      chwPractitionerId,
    })

    return patient
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
 * Emits CHW_PATIENT_IDENTIFIED audit event on success (AC #9).
 */
export async function identifyPatientByName(
  firstName: string,
  fatherName: string,
  chwPractitionerId: string,
): Promise<{ pid: string; firstName: string; age: number } | null> {
  if (!firstName.trim()) return null

  // Dynamic import to avoid circular dep issues and keep service testable
  const { getDb } = await import('./db')
  const db = getDb()

  const patients = await db.verified_patients.toArray()

  const firstNameNorm = firstName.trim().toLowerCase()
  const fatherNameNorm = fatherName.trim().toLowerCase()
  const matches = patients.filter(
    (p) => p.firstName.toLowerCase() === firstNameNorm,
  )

  if (matches.length === 0) return null

  // Disambiguate by father's name when multiple first-name matches exist (F9)
  let match = matches[0]!
  if (matches.length > 1 && fatherNameNorm) {
    const byFather = matches.find(
      (p) => (p.fatherName ?? '').toLowerCase() === fatherNameNorm,
    )
    if (byFather) match = byFather
  }

  const patient = {
    pid: match.patientId,
    firstName: match.firstName,
    age: match.age,
  }

  // Audit: CHW_PATIENT_IDENTIFIED — opaque patientRef only (AC #9)
  reportCHWPatientIdentifiedEvent({
    patientRef: patient.pid,
    identificationMethod: 'name',
    chwPractitionerId,
  })

  return patient
}

// ---------------------------------------------------------------------------
// Sample collection
// ---------------------------------------------------------------------------

/**
 * Collect a sample: validates input, atomically generates label + persists to Dexie.
 * Never throws on audit failure — collection must not be blocked by logging.
 *
 * Uses addCHWSampleAtomic so label generation and persistence are one transaction,
 * eliminating the race condition where two concurrent collects could get the same
 * label number (F7).
 */
export async function collectSample(
  input: CollectSampleInput,
): Promise<CHWSampleCollection> {
  if (!input.patientRef) throw new Error('patientRef is required')
  if (!input.patientFirstName) throw new Error('patientFirstName is required')
  if (input.patientAge < 0 || input.patientAge > 120) throw new Error('Invalid patient age')
  if (!input.sampleType) throw new Error('sampleType is required')
  if (!input.collectedBy) throw new Error('collectedBy is required')

  // Atomically assign label number + persist in a single Dexie transaction (F7)
  const sample = await addCHWSampleAtomic({
    id: crypto.randomUUID(),
    patientRef: input.patientRef,
    patientFirstName: input.patientFirstName, // first name ONLY — CLAUDE.md Rule #7
    patientAge: input.patientAge,
    sampleType: input.sampleType,
    collectedBy: input.collectedBy,
    collectedAt: serializeHlc(hlc.now()),
    ...(input.location ? { location: input.location } : {}),
    syncStatus: 'pending',
  })

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
 * Validates that all sampleIds exist in TODAY's Dexie log before persisting
 * (F11 — cross-day filter prevents stale sample IDs from prior shifts).
 * Returns the persisted handoff record.
 *
 * Throws if any sampleId is not found in today's records (prevents phantom handoffs).
 * Throws if collectedBy is absent — required for the audit chain (F6).
 */
export async function recordCourierHandoff(
  input: CourierHandoffInput,
): Promise<CourierHandoff> {
  if (!input.courierId.trim()) throw new Error('courierId is required')
  if (!input.sampleIds.length) throw new Error('At least one sample must be selected')
  if (!input.collectedBy) throw new Error('collectedBy is required for audit chain')

  // Validate all sample IDs exist in today's records (F11 today-only filter)
  const found = await getCHWSamplesByIds(input.sampleIds)
  const foundIds = new Set(found.map((s) => s.id))
  const missing = input.sampleIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Sample IDs not found in today's local records: ${missing.length} missing`)
  }

  const handoff: CourierHandoff = {
    id: crypto.randomUUID(),
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
    chwPractitionerId: input.collectedBy,
  })

  return handoff
}

// ---------------------------------------------------------------------------
// Sync queue
// ---------------------------------------------------------------------------

/**
 * Return all CHW samples and courier handoffs with syncStatus: 'pending'.
 * Used by the upload queue worker to drain offline-collected records.
 * Both record types are treated as Tier 2 (clinical) sync priority — newer wins,
 * both versions kept as addenda on conflict (F15).
 */
export async function getSyncQueue(): Promise<Array<CHWSampleCollection | CourierHandoff>> {
  return getPendingSyncItems()
}
