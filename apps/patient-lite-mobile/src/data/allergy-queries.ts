/**
 * Allergy data access layer — SQLCipher queries for AllergyIntolerance resources.
 * Story 18.5, Task 1: Allergy data access layer (AC: #1, #9).
 *
 * Queries the `medical_history` table filtered by resource_type = 'AllergyIntolerance'.
 * Data is stored encrypted in SQLCipher and synced from Hub via the sync engine.
 *
 * CLAUDE.md Rule #4: Allergy data gets the highest display prominence.
 * Tier 1 (safety-critical): append-only merge, never LWW.
 */
import type * as SQLite from 'expo-sqlite'
import { FhirAllergyIntoleranceSchema } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

interface MedicalHistoryRow {
  id: string
  patient_id: string
  resource_type: string
  data: string
  updated_at: string
}

/**
 * Parse a stored JSON row into a validated FhirAllergyIntolerance.
 * Returns null if the data is corrupted or fails schema validation.
 */
function parseAllergyRow(row: MedicalHistoryRow): FhirAllergyIntolerance | null {
  try {
    const parsed = JSON.parse(row.data)
    const result = FhirAllergyIntoleranceSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data as FhirAllergyIntolerance
  } catch {
    return null
  }
}

/**
 * Sort comparator: critical/severe allergies first, then alphabetical by substance.
 */
function allergySortComparator(a: FhirAllergyIntolerance, b: FhirAllergyIntolerance): number {
  const aCritical = a.criticality === 'high' ? 0 : 1
  const bCritical = b.criticality === 'high' ? 0 : 1
  if (aCritical !== bCritical) return aCritical - bCritical

  const aName = getSubstanceName(a).toLowerCase()
  const bName = getSubstanceName(b).toLowerCase()
  return aName.localeCompare(bName)
}

/**
 * Extract the display name for an allergy substance.
 */
export function getSubstanceName(allergy: FhirAllergyIntolerance): string {
  const coding = allergy.code?.coding?.[0]
  if (coding?.display) return coding.display
  if (allergy._ultranos?.substanceFreeText) return allergy._ultranos.substanceFreeText
  return coding?.code ?? 'Unknown substance'
}

/**
 * Fetch all active allergies from SQLCipher.
 * Sorted: critical/severe first, then alphabetical by substance.
 */
export async function getActiveAllergies(
  db: SQLite.SQLiteDatabase,
): Promise<FhirAllergyIntolerance[]> {
  const rows = await db.getAllAsync<MedicalHistoryRow>(
    `SELECT id, patient_id, resource_type, data, updated_at
     FROM medical_history
     WHERE resource_type = 'AllergyIntolerance'
     ORDER BY updated_at DESC`,
  )

  const allergies: FhirAllergyIntolerance[] = []
  for (const row of rows) {
    const allergy = parseAllergyRow(row)
    if (!allergy) continue
    // Filter to active clinical status only
    if (allergy.clinicalStatus?.coding?.[0]?.code === 'active') {
      allergies.push(allergy)
    }
  }

  return allergies.sort(allergySortComparator)
}

/**
 * Fetch a single allergy by ID from SQLCipher.
 */
export async function getAllergyById(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<FhirAllergyIntolerance | null> {
  const row = await db.getFirstAsync<MedicalHistoryRow>(
    `SELECT id, patient_id, resource_type, data, updated_at
     FROM medical_history
     WHERE id = ? AND resource_type = 'AllergyIntolerance'`,
    [id],
  )

  if (!row) return null
  return parseAllergyRow(row)
}

/**
 * Fetch ALL allergies (active + resolved) for FHIR Bundle export.
 * Story 18.8 integration point (AC: #7).
 */
export async function getAllAllergiesForExport(
  db: SQLite.SQLiteDatabase,
): Promise<FhirAllergyIntolerance[]> {
  const rows = await db.getAllAsync<MedicalHistoryRow>(
    `SELECT id, patient_id, resource_type, data, updated_at
     FROM medical_history
     WHERE resource_type = 'AllergyIntolerance'
     ORDER BY updated_at DESC`,
  )

  const allergies: FhirAllergyIntolerance[] = []
  for (const row of rows) {
    const allergy = parseAllergyRow(row)
    if (allergy) allergies.push(allergy)
  }

  return allergies
}
