import { DrugInteractionSeverity } from '@ultranos/shared-types'
import interactionData from '@/assets/vocab/interaction_matrix.json'

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

interface MatrixEntry {
  drugA: string
  drugB: string
  severity: string
  description: string
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

// Bidirectional lookup map: normalized drug name → Map<normalized drug name, InteractionResult>
let lookupMap: Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>> | null = null

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
  return map[s] ?? DrugInteractionSeverity.NONE
}

function ensureMap(): Map<string, Map<string, { severity: DrugInteractionSeverity; description: string }>> {
  if (lookupMap) return lookupMap

  lookupMap = new Map()
  const data = interactionData as MatrixEntry[]

  for (const entry of data) {
    const a = normalize(entry.drugA)
    const b = normalize(entry.drugB)
    const severity = severityFromString(entry.severity)
    const info = { severity, description: entry.description }

    // Add both directions
    if (!lookupMap.has(a)) lookupMap.set(a, new Map())
    lookupMap.get(a)!.set(b, info)

    if (!lookupMap.has(b)) lookupMap.set(b, new Map())
    lookupMap.get(b)!.set(a, info)
  }

  return lookupMap
}

/**
 * Check a new medication against a list of active medication display names.
 * Returns the overall interaction result and individual interaction details.
 *
 * Performance target: <200ms per call.
 */
export function checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
): InteractionCheckSummary {
  const map = ensureMap()
  const newDrugKey = normalize(newDrugDisplay)
  const drugLookup = map.get(newDrugKey)

  if (!drugLookup || activeMedDisplayNames.length === 0) {
    return { result: 'CLEAR', interactions: [] }
  }

  const interactions: InteractionResult[] = []

  for (const activeName of activeMedDisplayNames) {
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

  if (interactions.length === 0) {
    return { result: 'CLEAR', interactions: [] }
  }

  const hasBlocking = interactions.some((i) => BLOCKING_SEVERITIES.has(i.severity))
  const hasWarning = interactions.some((i) => WARNING_SEVERITIES.has(i.severity))

  const result = hasBlocking ? 'BLOCKED' : hasWarning ? 'WARNING' : 'CLEAR'

  return { result, interactions }
}
