import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance, FhirMedicationStatementZod } from '@ultranos/shared-types'
import type {
  DrugDatabaseAdapter,
  InteractionCheckOptions,
  InteractionCheckSummary,
  InteractionResult,
  VocabInteractionEntry,
} from './types.js'

// ---------------------------------------------------------------------------
// Staleness threshold (45 days in milliseconds)
// ---------------------------------------------------------------------------

/** Maximum age of the drug interaction database before checks are refused. */
export const STALENESS_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Severity → result mapping
// ---------------------------------------------------------------------------

const BLOCKING_SEVERITIES = new Set([
  DrugInteractionSeverity.CONTRAINDICATED,
  DrugInteractionSeverity.ALLERGY_MATCH,
  DrugInteractionSeverity.MAJOR,
])

const WARNING_SEVERITIES = new Set([
  DrugInteractionSeverity.MODERATE,
  DrugInteractionSeverity.MINOR,
])

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bidirectional lookup map (lazy-loaded, per-adapter cache)
// ---------------------------------------------------------------------------

type LookupInfo = { severity: DrugInteractionSeverity; description: string }
type LookupMap = Map<string, Map<string, LookupInfo>>

let cachedMap: LookupMap | null = null
let buildInFlight: Promise<LookupMap | null> | null = null
let cacheGeneration = 0

/**
 * Build a bidirectional lookup map from raw interaction entries.
 * Exported for testability — consumers should use `checkInteractions` instead.
 */
export function buildLookupMapFromEntries(entries: VocabInteractionEntry[]): LookupMap {
  const map: LookupMap = new Map()

  for (const entry of entries) {
    const a = normalize(entry.drugA)
    const b = normalize(entry.drugB)
    const severity = severityFromString(entry.severity)
    const info: LookupInfo = { severity, description: entry.description }

    if (!map.has(a)) map.set(a, new Map())
    map.get(a)!.set(b, info)

    if (!map.has(b)) map.set(b, new Map())
    map.get(b)!.set(a, info)
  }

  return map
}

async function ensureMap(adapter: DrugDatabaseAdapter): Promise<LookupMap | null> {
  if (cachedMap) return cachedMap
  if (!buildInFlight) {
    const gen = cacheGeneration
    buildInFlight = adapter
      .getInteractions()
      .then((entries) => {
        const m = buildLookupMapFromEntries(entries)
        // Discard result if cache was invalidated while this build was in flight
        if (gen !== cacheGeneration) return cachedMap
        cachedMap = m.size > 0 ? m : null
        buildInFlight = null
        return cachedMap
      })
      .catch((err: unknown) => {
        if (gen === cacheGeneration) buildInFlight = null
        throw err
      })
  }
  return buildInFlight
}

/**
 * Invalidate the cached interaction map.
 * Call after vocabulary sync updates the interactions table.
 */
export function invalidateCache(): void {
  cachedMap = null
  buildInFlight = null
  cacheGeneration++
}

// ---------------------------------------------------------------------------
// Medication helpers
// ---------------------------------------------------------------------------

/**
 * Extract medication display names from an array of MedicationStatements.
 */
export function getMedicationNamesFromStatements(statements: FhirMedicationStatementZod[]): string[] {
  return statements
    .map((ms) => {
      const concept = ms.medicationCodeableConcept as {
        coding?: Array<{ system: string; code: string; display?: string }>
        text?: string
      }
      return concept.coding?.[0]?.display ?? concept.text ?? ''
    })
    .filter((name) => name.length > 0)
}

// ---------------------------------------------------------------------------
// Allergy matching
// ---------------------------------------------------------------------------

/**
 * Check a new medication against the patient's active allergies.
 * Case-insensitive substring matching with a minimum 3-character filter
 * to avoid false positives.
 */
export function checkAllergyMatch(
  newDrugDisplay: string,
  activeAllergies: FhirAllergyIntolerance[],
): InteractionResult[] {
  if (activeAllergies.length === 0) return []

  const drugKey = normalize(newDrugDisplay)
  if (drugKey.length < 3) return []

  const matches: InteractionResult[] = []

  for (const allergy of activeAllergies) {
    const substance =
      allergy._ultranos.substanceFreeText || allergy.code.text || ''
    const substanceKey = normalize(substance)

    if (!substanceKey || substanceKey.length < 3) continue

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

// ---------------------------------------------------------------------------
// Main interaction check
// ---------------------------------------------------------------------------

/**
 * Check a new medication against active medications and allergies.
 *
 * Returns:
 * - `UNAVAILABLE` if no adapter provided, database is empty, or adapter fails
 *   (preserves any allergy matches already found)
 * - `BLOCKED` if any CONTRAINDICATED, ALLERGY_MATCH, or MAJOR interaction detected
 * - `WARNING` if any MODERATE or MINOR interaction detected
 * - `CLEAR` if no interactions detected (database had data)
 */
export async function checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
  allergiesOrOptions?: FhirAllergyIntolerance[] | InteractionCheckOptions,
  adapter?: DrugDatabaseAdapter,
): Promise<InteractionCheckSummary> {
  // Resolve the overloaded third argument
  let activeAllergies: FhirAllergyIntolerance[] = []
  let activeMedications: FhirMedicationStatementZod[] = []
  let options: InteractionCheckOptions | undefined

  if (allergiesOrOptions && !Array.isArray(allergiesOrOptions)) {
    options = allergiesOrOptions
    activeMedications = allergiesOrOptions.activeMedications ?? []
    activeAllergies = allergiesOrOptions.activeAllergies ?? []
  } else if (Array.isArray(allergiesOrOptions)) {
    activeAllergies = allergiesOrOptions
  }

  const interactions: InteractionResult[] = []

  // 1. Allergy matches (safety-critical — checked first, never discarded)
  if (activeAllergies.length > 0) {
    interactions.push(...checkAllergyMatch(newDrugDisplay, activeAllergies))
  }

  // 2. Staleness check — must run BEFORE interaction lookup (per-call, not cached)
  if (adapter?.getMetadata) {
    try {
      const metadata = await adapter.getMetadata()
      if (metadata?.lastUpdatedAt) {
        const age = Date.now() - new Date(metadata.lastUpdatedAt).getTime()
        if (Number.isNaN(age) || age > STALENESS_THRESHOLD_MS) {
          options?.onStale?.() // fire-and-forget
          return { result: 'UNAVAILABLE', interactions, reason: 'DATABASE_STALE' }
        }
      }
    } catch {
      // getMetadata failure is non-fatal — proceed with interaction check
    }
  }

  // 3. Merge pending prescriptions with active MedicationStatement names
  const historyNames = getMedicationNamesFromStatements(activeMedications)
  const allActiveMedNames = [...new Set([...activeMedDisplayNames, ...historyNames])]

  // 4. Drug-drug interactions via adapter
  if (!adapter) {
    // No adapter: drug-drug check cannot be performed — signal UNAVAILABLE
    // but preserve any allergy matches already found
    return { result: 'UNAVAILABLE', interactions, reason: 'ADAPTER_ERROR' }
  }

  let map: LookupMap | null
  try {
    map = await ensureMap(adapter)
  } catch {
    // Adapter failure (network, DB corruption, etc.) — return UNAVAILABLE
    // but preserve any allergy matches already found
    return { result: 'UNAVAILABLE', interactions, reason: 'ADAPTER_ERROR' }
  }

  // Empty database guard: never return CLEAR on empty data
  if (!map) {
    return { result: 'UNAVAILABLE', interactions, reason: 'EMPTY_DATABASE' }
  }

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
