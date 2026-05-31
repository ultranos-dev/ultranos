import { getDb } from '@/lib/db'

export interface RecentSampleResult {
  patientRef: string  // opaque "Patient/<uuid>"
  sampleId: string
  processedAt: string // ISO 8601
}

export interface SourceStatus {
  hepB: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN'
  hiv: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN'
  hepC: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN'
}

// Data minimization: only firstName and age per CLAUDE.md Rule #7.
// The Lab Portal must NEVER expose DOB, full name, or other PHI.
export interface SourcePatientDisplay {
  firstName: string
  age: number | null
  patientRef: string  // opaque only — NEVER expose full name or DOB (CLAUDE.md Rule #7)
}

/**
 * Find the most recently processed sample for a given lab technician.
 * Used to identify the source patient when a post-exposure incident is reported.
 * Returns null if no sample is found or on any error.
 */
export async function getLastProcessedSample(techId: string): Promise<RecentSampleResult | null> {
  try {
    const db = getDb()
    // samples table may not exist in earlier db versions — guard with try/catch
    const allSamples = await (db as any).samples.toArray()
    const techSamples = (allSamples as any[]).filter(
      (s) => (s as any)._ultranos?.accessionedBy === techId,
    )
    if (!techSamples.length) {
      return null
    }
    techSamples.sort((a: any, b: any) => {
      const aTime = a.meta?.lastUpdated ?? ''
      const bTime = b.meta?.lastUpdated ?? ''
      return bTime.localeCompare(aTime)
    })
    const specimen = techSamples[0]
    return {
      patientRef: specimen.subject?.reference ?? '',
      sampleId: specimen.id ?? '',
      processedAt: specimen.meta?.lastUpdated ?? '',
    }
  } catch {
    return null
  }
}

/**
 * Returns the infectious disease status for a source patient.
 * The verified_patients table stores ONLY firstName and age (CLAUDE.md Rule #7).
 * Infectious status would come from Story 42.3 lab results — if not available,
 * we treat as UNKNOWN per the precautionary principle.
 */
export async function getSourcePatientStatus(patientRef: string): Promise<SourceStatus> {
  try {
    // Confirm the patient exists in our local cache
    await getDb().verified_patients.get(patientRef)
    // Infectious status is NOT stored in verified_patients.
    // Always return UNKNOWN until Story 42.3 lab result linkage is implemented.
    return { hepB: 'UNKNOWN', hiv: 'UNKNOWN', hepC: 'UNKNOWN' }
  } catch {
    return { hepB: 'UNKNOWN', hiv: 'UNKNOWN', hepC: 'UNKNOWN' }
  }
}

/**
 * Returns the minimal patient display record for a source patient.
 * Enforces CLAUDE.md Rule #7: only firstName and age are returned — never DOB,
 * full name, address, or any other PHI.
 */
export async function getSourcePatientDisplay(
  patientRef: string,
): Promise<SourcePatientDisplay | null> {
  try {
    const db = getDb()
    // patientRef may be "Patient/<uuid>" or just the uuid — try both
    const uuid = patientRef.startsWith('Patient/')
      ? patientRef.slice('Patient/'.length)
      : patientRef
    const record =
      (await db.verified_patients.get(patientRef)) ??
      (await db.verified_patients.get(uuid))
    if (!record) {
      return null
    }
    return {
      firstName: record.firstName,
      age: record.age,
      patientRef,
    }
  } catch {
    return null
  }
}
