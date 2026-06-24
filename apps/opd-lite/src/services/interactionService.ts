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
import { resolveDrugAdapter } from '@/lib/mirror-drug-adapter'
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'

// Re-export types for existing consumers
export type { InteractionCheckOptions, InteractionCheckSummary, InteractionResult }

// Re-export pure functions unchanged
export { checkAllergyMatch, getMedicationNamesFromStatements }

// Map the shared package's invalidateCache to the legacy name
export const invalidateInteractionCache = invalidateCache

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
  const adapter = await resolveDrugAdapter()

  let optionsWithStale: FhirAllergyIntolerance[] | InteractionCheckOptions | undefined = allergiesOrOptions
  if (allergiesOrOptions && !Array.isArray(allergiesOrOptions)) {
    optionsWithStale = {
      ...allergiesOrOptions,
      onStale: () => { syncDrugCatalog().catch(() => {}) },
    }
  } else if (!allergiesOrOptions || Array.isArray(allergiesOrOptions)) {
    optionsWithStale = {
      activeAllergies: Array.isArray(allergiesOrOptions) ? allergiesOrOptions : undefined,
      onStale: () => { syncDrugCatalog().catch(() => {}) },
    }
  }

  return _checkInteractions(newDrugDisplay, activeMedDisplayNames, optionsWithStale, adapter)
}
