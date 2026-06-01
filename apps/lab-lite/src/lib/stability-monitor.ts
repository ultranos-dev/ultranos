/**
 * Stability monitor for courier transport sessions.
 *
 * Determines which samples in a transport have exceeded their ambient-temperature
 * stability window. This is a safety-critical pre-analytical check — exceeded
 * windows produce TransportFlag entries that the receiving technician must
 * acknowledge before processing (AC 3, 4).
 *
 * CLAUDE.md Rule #1: No PHI in this module — labSampleId is a label number (e.g. "L2026-001"),
 * not a patient name. sampleId is an opaque FhirSpecimen UUID.
 */

import type { FhirSpecimen } from '@ultranos/shared-types'
import {
  DEFAULT_STABILITY_WINDOWS,
  type TransportFlag,
  type TransportSession,
  type SampleStabilityWindow,
} from '@/types/transport'

// ---------------------------------------------------------------------------
// mapSampleTypeToCategory
// ---------------------------------------------------------------------------

/**
 * Maps a specimen type display name to one of the known stability window
 * category keys. Matching is case-insensitive substring matching.
 *
 * Conservative fallback: unknown types map to 'blood' (shortest window at 6h)
 * so that edge cases err on the side of caution rather than missing a flag.
 */
export function mapSampleTypeToCategory(displayName: string): string {
  if (!displayName) return 'blood'

  const lower = displayName.toLowerCase()

  // CSF — check before "blood" to avoid false positives on unrelated terms
  if (lower.includes('csf') || lower.includes('cerebrospinal') || lower.includes('spinal fluid')) {
    return 'csf'
  }

  // Blood
  if (
    lower.includes('blood') ||
    lower.includes('edta') ||
    lower.includes('cbc') ||
    lower.includes('serum') ||
    lower.includes('plasma')
  ) {
    return 'blood'
  }

  // Urine
  if (lower.includes('urine') || lower.includes('urinalysis') || lower.includes('urine culture')) {
    return 'urine'
  }

  // Swab
  if (
    lower.includes('swab') ||
    lower.includes('nasopharyngeal') ||
    lower.includes('throat') ||
    lower.includes('wound')
  ) {
    return 'swab'
  }

  // Stool
  if (lower.includes('stool') || lower.includes('feces') || lower.includes('fecal')) {
    return 'stool'
  }

  // Conservative fallback — blood has the shortest default window (6h)
  return 'blood'
}

// ---------------------------------------------------------------------------
// getStabilityWindow
// ---------------------------------------------------------------------------

/**
 * Returns the stability window in HOURS for a given sample type category key.
 * Prefers lab-specific settings if provided, falls back to DEFAULT_STABILITY_WINDOWS,
 * then to 6 hours (blood window) if the key is not found in either.
 */
export function getStabilityWindow(
  sampleType: string,
  labSettings?: SampleStabilityWindow,
): number {
  if (labSettings && typeof labSettings[sampleType] === 'number') {
    return labSettings[sampleType]
  }
  if (typeof DEFAULT_STABILITY_WINDOWS[sampleType] === 'number') {
    return DEFAULT_STABILITY_WINDOWS[sampleType]
  }
  // Final fallback — most conservative known window
  return 6
}

// ---------------------------------------------------------------------------
// checkStabilityWindows
// ---------------------------------------------------------------------------

/**
 * Checks whether any samples in a transport session have exceeded their
 * stability window. Returns an array of TransportFlag entries (empty if none).
 *
 * Elapsed time is measured from pickupTimestamp to now, or to deliveryTimestamp
 * if the session has been delivered.
 *
 * Fail-safe behaviour: if pickupTimestamp cannot be parsed, returns an empty
 * array rather than generating false flags on bad data.
 */
export function checkStabilityWindows(
  session: TransportSession,
  samples: FhirSpecimen[],
  labSettings?: SampleStabilityWindow,
): TransportFlag[] {
  const pickupMs = Date.parse(session.pickupTimestamp)
  if (isNaN(pickupMs)) {
    // Cannot determine elapsed time — fail safe, no flags
    return []
  }

  const endMs = session.deliveryTimestamp
    ? Date.parse(session.deliveryTimestamp)
    : Date.now()

  const elapsedHours = (endMs - pickupMs) / (1000 * 60 * 60)

  const flags: TransportFlag[] = []

  for (const specimen of samples) {
    const displayName =
      specimen.type?.coding?.[0]?.display ?? ''

    const category = mapSampleTypeToCategory(displayName)
    const windowHours = getStabilityWindow(category, labSettings)

    if (elapsedHours > windowHours) {
      const labSampleId = specimen._ultranos.labSampleId
      flags.push({
        sampleId: specimen.id,
        labSampleId,
        flagType: 'stability-exceeded',
        message: `Sample ${labSampleId} exceeded ${windowHours}-hour stability window. Flag for pre-analytical error.`,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return flags
}
