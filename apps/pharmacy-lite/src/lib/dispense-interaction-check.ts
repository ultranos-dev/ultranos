import { checkInteractions } from '@ultranos/drug-db'
import type { InteractionResult } from '@ultranos/drug-db'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { resolveDrugAdapter } from './mirror-drug-adapter'
import type { InteractionStatus } from '@/components/pharmacy/InteractionCheckBanner'

function toAllergyResources(allergies: string[]): FhirAllergyIntolerance[] {
  return allergies.map((substance) => ({ code: { text: substance }, _ultranos: { substanceFreeText: substance } }) as unknown as FhirAllergyIntolerance)
}

function formatInteraction(i: InteractionResult): string {
  return `${i.drugA} + ${i.drugB}: ${i.description}`
}

/**
 * Re-check the prescribed meds against each other + the patient's local allergies.
 * Rule #3: an empty/unavailable mirror yields 'unavailable' — never 'clear'.
 */
export async function runDispenseInteractionCheck(
  medDisplays: string[],
  allergies: string[],
): Promise<InteractionStatus> {
  const adapter = await resolveDrugAdapter()
  if (!adapter) return { state: 'unavailable', reason: 'Drug data not yet synced to this device.' }

  // Rule #3: "no meds to check" is not "clear" — never imply safe on absent input.
  const meds = medDisplays.filter((m) => m && m.trim().length > 0)
  if (meds.length === 0) return { state: 'unavailable', reason: 'No medications available to check.' }

  const allergyResources = toAllergyResources(allergies)
  const all: InteractionResult[] = []
  let worst: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE' = 'CLEAR'

  for (let i = 0; i < meds.length; i++) {
    const others = meds.filter((_, j) => j !== i)
    const summary = await checkInteractions(meds[i]!, others, { activeAllergies: allergyResources }, adapter)
    if (summary.result === 'UNAVAILABLE') return { state: 'unavailable', reason: 'Interaction check unavailable.' }
    if (summary.result === 'BLOCKED') worst = 'BLOCKED'
    else if (summary.result === 'WARNING' && worst !== 'BLOCKED') worst = 'WARNING'
    all.push(...summary.interactions)
  }

  const messages = Array.from(new Set(all.map(formatInteraction)))
  if (worst === 'BLOCKED') return { state: 'contraindicated', interactions: messages }
  if (worst === 'WARNING') return { state: 'warning', interactions: messages }
  return { state: 'clear' }
}
