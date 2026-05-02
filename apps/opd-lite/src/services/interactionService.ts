import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance, FhirMedicationStatementZod } from '@ultranos/shared-types'
import { db } from '@/lib/db'

export interface InteractionResult {
  severity: DrugInteractionSeverity
  drugA: string
  drugB: string
  description: string
}

export interface InteractionCheckSummary {
  /** Overall result: BLOCKED if any CONTRAINDICATED/MAJOR, WARNING if MODERATE/MINOR, CLEAR otherwise */
  result: 'CLEAR' | 'WARNING' | 'BLOCKED'
  interactions: InteractionResult[]
}

// Severity → result mapping:
// CONTRAINDICATED, ALLERGY_MATCH, MAJOR → BLOCKED (show modal)
// MODERATE, MINOR → WARNING (inline warning)
const BLOCKING_SEVERITIES = new Set([
  DrugInteractionSeverity.CONTRAINDICATED,
  DrugInteractionSeverity.ALLERGY_MATCH,
  DrugInteractionSeverity.MAJOR,
])

const WARNING_SEVERITIES = new Set([
  DrugInteractionSeverity.MODERATE,
  DrugInteractionSeverity.MINOR,
])

// Bidirectional lookup map: normalized drug name → Map<normalized drug name, info>
// Lazy-loaded from Dexie on first use, invalidated on vocabulary sync.
let lookupMap: Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>> | null = null
let buildInFlight: Promise<Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>>> | null = null

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

function severityFromString(s: string): DrugInteractionSeverity {
  const map: Record<string, DrugInteractionSeverity> = {
    CONTRAINDICATED: DrugInteractionSeverity.CONTRAINDICATED,
    ALLERGY_MATCH: DrugInteractionSeverity.ALLERGY_MATCH,
    MAJOR: DrugInteractionSeverity.MAJOR,
    MODERATE: DrugInteractionSeverity.MODERATE,
    MINOR: DrugInteractionSeverity.MINOR,
    NONE: DrugInteractionSeverity.NONE,
  }
  const result = map[s]
  if (result === undefined) throw new Error(`Unknown drug interaction severity: "${s}"`)
  return result
}

/**
 * Builds the bidirectional lookup map from Dexie data.
 * Called lazily on first interaction check.
 */
async function buildLookupMap(): Promise<Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>>> {
  const data = await db.vocabularyInteractions.toArray()

  const map = new Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>>()

  for (const entry of data) {
    const a = normalize(entry.drugA)
    const b = normalize(entry.drugB)
    const severity = severityFromString(entry.severity)
    const info = { severity, description: entry.description }

    // Add both directions
    if (!map.has(a)) map.set(a, new Map())
    map.get(a)!.set(b, info)

    if (!map.has(b)) map.set(b, new Map())
    map.get(b)!.set(a, info)
  }

  if (map.size === 0) throw new Error('Interaction database empty')

  return map
}

async function ensureMap(): Promise<Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>>> {
  if (lookupMap) return lookupMap
  if (!buildInFlight) {
    buildInFlight = buildLookupMap()
      .then((m) => {
        lookupMap = m
        buildInFlight = null
        return m
      })
      .catch((err: unknown) => {
        buildInFlight = null
        throw err
      })
  }
  return buildInFlight
}

/**
 * Invalidate the cached interaction map.
 * Call this after vocabulary sync updates the interactions table.
 */
export function invalidateInteractionCache(): void {
  lookupMap = null
  buildInFlight = null
}

/**
 * Story 10.1 AC 7: Extract medication identifiers from a MedicationStatement.
 * Prefers code-based matching when codes are available, falls back to display name.
 */
function extractMedicationIdentifier(ms: FhirMedicationStatementZod): { code?: string; display: string } {
  const concept = ms.medicationCodeableConcept as { coding?: Array<{ system: string; code: string; display?: string }>; text?: string }
  const coding = concept.coding?.[0]
  return {
    code: coding?.code,
    display: coding?.display ?? concept.text ?? '',
  }
}

/**
 * Story 10.1 AC 7: Extract all medication display names from MedicationStatements.
 * Used to build the combined list of active medications for interaction checking.
 */
export function getMedicationNamesFromStatements(statements: FhirMedicationStatementZod[]): string[] {
  return statements
    .map((ms) => extractMedicationIdentifier(ms).display)
    .filter((name) => name.length > 0)
}

/**
 * Check a new medication against the patient's active allergies.
 * Uses exact substring matching on substance names (case-insensitive).
 * Returns ALLERGY_MATCH results for any matches.
 *
 * Story 10.2 Task 7: ALLERGY_MATCH triggers the same blocking modal
 * as CONTRAINDICATED — identical protocol per PRD Section 20.2.
 */
export function checkAllergyMatch(
  newDrugDisplay: string,
  activeAllergies: FhirAllergyIntolerance[],
): InteractionResult[] {
  if (activeAllergies.length === 0) return []

  const drugKey = normalize(newDrugDisplay)

  // Degenerate drug name — skip matching to avoid false positives
  if (drugKey.length < 3) return []

  const matches: InteractionResult[] = []

  for (const allergy of activeAllergies) {
    const substance =
      allergy._ultranos.substanceFreeText || allergy.code.text || ''
    const substanceKey = normalize(substance)

    // Skip degenerate matches — single/double-char strings produce false positives
    if (!substanceKey || substanceKey.length < 3) continue

    // Substring match in either direction: drug contains allergy substance,
    // or allergy substance contains drug name
    if (drugKey.includes(substanceKey) || substanceKey.includes(drugKey)) {
      matches.push({
        severity: DrugInteractionSeverity.ALLERGY_MATCH,
        drugA: newDrugDisplay,
        drugB: substance,
        description: `Patient has a documented allergy to "${substance}" — medication may be contraindicated`,
      })
    }
  }

  return matches
}

/**
 * Story 10.1: Extended options for cross-encounter interaction checks.
 */
export interface InteractionCheckOptions {
  /** Active MedicationStatements from patient history (cross-encounter) */
  activeMedications?: FhirMedicationStatementZod[]
  /** Active allergies from Story 10.2 */
  activeAllergies?: FhirAllergyIntolerance[]
}

/**
 * Check a new medication against:
 * 1. Pending prescriptions in the current encounter (existing behavior)
 * 2. Active MedicationStatements from patient history (Story 10.1)
 * 3. Active allergies (Story 10.2)
 *
 * Supports both the legacy 3-argument signature and the new options-based signature.
 *
 * Performance target: <200ms per call.
 */
export async function checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
  allergiesOrOptions?: FhirAllergyIntolerance[] | InteractionCheckOptions,
): Promise<InteractionCheckSummary> {
  // Resolve arguments: support both legacy and new options signatures
  let activeMedications: FhirMedicationStatementZod[] = []
  let activeAllergies: FhirAllergyIntolerance[] = []

  if (allergiesOrOptions && !Array.isArray(allergiesOrOptions)) {
    activeMedications = allergiesOrOptions.activeMedications ?? []
    activeAllergies = allergiesOrOptions.activeAllergies ?? []
  } else if (Array.isArray(allergiesOrOptions)) {
    activeAllergies = allergiesOrOptions
  }

  const interactions: InteractionResult[] = []

  // 1. Check allergy matches first (safety-critical)
  if (activeAllergies.length > 0) {
    const allergyMatches = checkAllergyMatch(newDrugDisplay, activeAllergies)
    interactions.push(...allergyMatches)
  }

  // 2. Merge pending prescriptions with active MedicationStatement names
  // Story 10.1 AC 5: check against BOTH current encounter + patient history
  const historyNames = getMedicationNamesFromStatements(activeMedications)
  const allActiveMedNames = [...new Set([...activeMedDisplayNames, ...historyNames])]

  // 3. Check drug-drug interactions against combined list
  const map = await ensureMap()
  const newDrugKey = normalize(newDrugDisplay)
  const drugLookup = map.get(newDrugKey)

  if (drugLookup && allActiveMedNames.length > 0) {
    for (const activeName of allActiveMedNames) {
      const activeKey = normalize(activeName)
      const info = drugLookup.get(activeKey)
      if (info) {
        interactions.push({
          severity: info.severity,
          drugA: newDrugDisplay,
          drugB: activeName,
          description: info.description,
        })
      }
    }
  }

  if (interactions.length === 0) {
    return { result: 'CLEAR', interactions: [] }
  }

  const hasBlocking = interactions.some((i) => BLOCKING_SEVERITIES.has(i.severity))
  const hasWarning = interactions.some((i) => WARNING_SEVERITIES.has(i.severity))

  const result = hasBlocking ? 'BLOCKED' : hasWarning ? 'WARNING' : 'CLEAR'

  return { result, interactions }
}
