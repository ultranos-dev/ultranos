/**
 * FHIR R4 Bundle builder for patient data export.
 * Story 18.8: Generates a FHIR R4 Bundle (type: collection) containing
 * all patient resources from the local SQLCipher database.
 *
 * AC #2: All resource types included
 * AC #3: Valid FHIR R4 JSON
 * AC #4: Each entry has fullUrl (URN) + resource
 * AC #10: Bundle meta with lastUpdated + ultranos tag
 */
import type * as SQLite from 'expo-sqlite'
import type { FhirPatient, FhirConsent } from '@ultranos/shared-types'

/** Row shape from medical_history table */
interface MedicalHistoryRow {
  id: string
  patient_id: string
  resource_type: string
  data: string
  updated_at: string
}

/** Row shape from consents table */
interface ConsentRow {
  id: string
  patient_id: string
  category: string
  status: string
  data: string
  updated_at: string
}

/** Row shape from patient_profiles table */
interface PatientProfileRow {
  id: string
  data: string
  updated_at: string
}

/** FHIR R4 Bundle entry */
interface BundleEntry {
  fullUrl: string
  resource: Record<string, unknown>
}

/** FHIR R4 Bundle (collection type) */
export interface FhirBundle {
  resourceType: 'Bundle'
  type: 'collection'
  timestamp: string
  meta: {
    lastUpdated: string
    tag: { system: string; code: string }[]
  }
  entry: BundleEntry[]
}

/** Resource types we collect from medical_history */
const MEDICAL_RESOURCE_TYPES = [
  'Encounter',
  'MedicationRequest',
  'MedicationStatement',
  'AllergyIntolerance',
  'Observation',
  'Condition',
] as const

/** Progress callback — receives current status text */
export type ProgressCallback = (message: string) => void

/**
 * Build a FHIR R4 Bundle containing all patient resources.
 *
 * Reads from SQLCipher tables:
 * - patient_profiles → Patient resource
 * - medical_history → Encounter, MedicationRequest, MedicationStatement,
 *   AllergyIntolerance, Observation, Condition
 * - consents → Consent resources
 */
export async function buildPatientBundle(
  db: SQLite.SQLiteDatabase,
  onProgress?: ProgressCallback,
): Promise<FhirBundle> {
  const entries: BundleEntry[] = []
  let totalCount = 0

  // 1. Patient resource from patient_profiles
  onProgress?.('Loading patient profile...')
  const patientRow = await db.getFirstAsync<PatientProfileRow>(
    'SELECT id, data, updated_at FROM patient_profiles LIMIT 1',
  )

  if (patientRow) {
    const patient = parseJsonSafe<FhirPatient>(patientRow.data)
    if (patient && patient.resourceType === 'Patient') {
      entries.push({
        fullUrl: `urn:uuid:${patient.id ?? patientRow.id}`,
        resource: patient as unknown as Record<string, unknown>,
      })
      totalCount++
    }
  }

  // 2. Medical history resources by type
  for (const resourceType of MEDICAL_RESOURCE_TYPES) {
    onProgress?.(`Preparing ${resourceType} records...`)

    const rows = await db.getAllAsync<MedicalHistoryRow>(
      `SELECT id, patient_id, resource_type, data, updated_at
       FROM medical_history
       WHERE resource_type = ?
       ORDER BY updated_at DESC`,
      [resourceType],
    )

    for (const row of rows) {
      const resource = parseJsonSafe<Record<string, unknown>>(row.data)
      if (resource && resource.resourceType === resourceType) {
        entries.push({
          fullUrl: `urn:uuid:${resource.id ?? row.id}`,
          resource,
        })
        totalCount++
      }
    }
  }

  // 3. Consent resources
  onProgress?.('Preparing Consent records...')
  const consentRows = await db.getAllAsync<ConsentRow>(
    `SELECT id, patient_id, category, status, data, updated_at
     FROM consents
     ORDER BY updated_at DESC`,
  )

  for (const row of consentRows) {
    const consent = parseJsonSafe<FhirConsent>(row.data)
    if (consent && consent.resourceType === 'Consent') {
      entries.push({
        fullUrl: `urn:uuid:${consent.id ?? row.id}`,
        resource: consent as unknown as Record<string, unknown>,
      })
      totalCount++
    }
  }

  onProgress?.(`Preparing ${totalCount} records...`)

  const now = new Date().toISOString()

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now,
    meta: {
      lastUpdated: now,
      tag: [{ system: 'ultranos', code: 'patient-export' }],
    },
    entry: entries,
  }
}

/**
 * Count resources by type in a bundle — used for audit logging.
 */
export function countResourceTypes(bundle: FhirBundle): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of bundle.entry) {
    const type = (entry.resource.resourceType as string) ?? 'Unknown'
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

/** Safely parse JSON, returning null on failure */
function parseJsonSafe<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
