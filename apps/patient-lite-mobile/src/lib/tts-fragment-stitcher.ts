/**
 * Story 24.2 Task 4: Offline Voice Fragment System
 *
 * Provides offline TTS by stitching pre-recorded voice fragments
 * for the top-500 formulary medications. Fragments are bundled with
 * the app as generic assets (NOT PHI — not patient-specific).
 *
 * Real production fragments are recorded by professional native voice actors.
 * Development uses placeholder silent fragments.
 */

export type FragmentDialect = 'AR_LEVANTINE' | 'AR_GULF' | 'DARI' | 'EN'

export type FragmentType =
  | 'medication_name'
  | 'dose_unit'
  | 'frequency'
  | 'duration'
  | 'caution'
  | 'disclaimer'

export interface VoiceFragment {
  medicationCode: string
  dialect: FragmentDialect
  fragmentType: FragmentType
  /** Asset path relative to the app bundle */
  assetPath: string
}

export interface DosageInstruction {
  dose?: string
  frequency?: string
  duration?: string
  caution?: string
}

/**
 * Fragment database — maps medication codes to pre-recorded audio asset paths.
 * In production, this would be populated from the bundled fragment database.
 * For development, placeholder entries are used.
 */
const FRAGMENT_DB = new Map<string, VoiceFragment[]>()

/**
 * Register a fragment in the in-memory database.
 * Called during app initialization to populate from bundled assets.
 */
export function registerFragment(fragment: VoiceFragment): void {
  const key = `${fragment.medicationCode}:${fragment.dialect}`
  const existing = FRAGMENT_DB.get(key) ?? []
  existing.push(fragment)
  FRAGMENT_DB.set(key, existing)
}

/**
 * Register multiple fragments at once (bulk initialization).
 */
export function registerFragments(fragments: VoiceFragment[]): void {
  for (const f of fragments) {
    registerFragment(f)
  }
}

/**
 * Clear all registered fragments (useful for testing).
 */
export function clearFragments(): void {
  FRAGMENT_DB.clear()
}

/**
 * Look up available fragments for a medication in a specific dialect.
 * Returns null if the medication is not in the top-500 formulary.
 */
function getFragments(
  medicationCode: string,
  dialect: FragmentDialect,
): VoiceFragment[] | null {
  const key = `${medicationCode}:${dialect}`
  const fragments = FRAGMENT_DB.get(key)
  if (!fragments || fragments.length === 0) return null
  return fragments
}

/**
 * Get the ordered list of fragment asset paths for stitching.
 *
 * Order: medication_name → dose_unit → frequency → duration → caution → disclaimer
 * Missing fragments are skipped (except medication_name which is required).
 * Returns null if the medication is not in the fragment database.
 */
export function getStitchableFragments(
  medicationCode: string,
  dialect: FragmentDialect,
): string[] | null {
  const fragments = getFragments(medicationCode, dialect)
  if (!fragments) return null

  const fragmentOrder: FragmentType[] = [
    'medication_name',
    'dose_unit',
    'frequency',
    'duration',
    'caution',
    'disclaimer',
  ]

  const fragmentMap = new Map<FragmentType, VoiceFragment>()
  for (const f of fragments) {
    fragmentMap.set(f.fragmentType, f)
  }

  // medication_name is required
  if (!fragmentMap.has('medication_name')) return null

  const orderedPaths: string[] = []
  for (const type of fragmentOrder) {
    const fragment = fragmentMap.get(type)
    if (fragment) {
      orderedPaths.push(fragment.assetPath)
    }
  }

  return orderedPaths.length > 0 ? orderedPaths : null
}

/**
 * Check if offline fragments are available for a medication.
 */
export function hasOfflineFragments(
  medicationCode: string,
  dialect: FragmentDialect,
): boolean {
  return getStitchableFragments(medicationCode, dialect) !== null
}

/**
 * The silence gap duration between stitched fragments (ms).
 */
export const FRAGMENT_GAP_MS = 200
