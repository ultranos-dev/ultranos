import {
  checkInteractions as _checkInteractions,
  checkAllergyMatch,
  invalidateCache,
  getMedicationNamesFromStatements,
} from '@ultranos/drug-db'
import type {
  InteractionCheckOptions,
  InteractionCheckSummary,
  InteractionResult,
} from '@ultranos/drug-db'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { createDexieDrugAdapter } from '@/lib/dexie-drug-adapter'
import { syncAllVocabulary } from '@/lib/vocabulary-sync'

// Re-export types for existing consumers
export type { InteractionCheckOptions, InteractionCheckSummary, InteractionResult }

// Re-export pure functions unchanged
export { checkAllergyMatch, getMedicationNamesFromStatements }

// Map the shared package's invalidateCache to the legacy name
export const invalidateInteractionCache = invalidateCache

// Singleton Dexie adapter — shared across all calls in OPD Lite
const adapter = createDexieDrugAdapter()

/**
 * Check a new medication against active medications and allergies.
 * Thin wrapper that injects the OPD Lite Dexie adapter into @ultranos/drug-db.
 *
 * Preserves the existing API signature for backward compatibility:
 *   checkInteractions(drug, activeMeds)
 *   checkInteractions(drug, activeMeds, allergies[])
 *   checkInteractions(drug, activeMeds, { activeMedications, activeAllergies })
 */
export async function checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
  allergiesOrOptions?: FhirAllergyIntolerance[] | InteractionCheckOptions,
): Promise<InteractionCheckSummary> {
  // Inject onStale callback to trigger background sync when database is stale
  let optionsWithStale: FhirAllergyIntolerance[] | InteractionCheckOptions | undefined = allergiesOrOptions
  if (allergiesOrOptions && !Array.isArray(allergiesOrOptions)) {
    optionsWithStale = {
      ...allergiesOrOptions,
      onStale: () => { syncAllVocabulary().catch(() => {}) },
    }
  } else if (!allergiesOrOptions || Array.isArray(allergiesOrOptions)) {
    // Wrap array-style allergies into options format to carry onStale
    optionsWithStale = {
      activeAllergies: Array.isArray(allergiesOrOptions) ? allergiesOrOptions : undefined,
      onStale: () => { syncAllVocabulary().catch(() => {}) },
    }
  }

  return _checkInteractions(newDrugDisplay, activeMedDisplayNames, optionsWithStale, adapter)
}
