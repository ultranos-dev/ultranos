/**
 * ATC-based medication sensitivity classifier.
 *
 * Identifies medications that should be hidden behind a privacy gate
 * due to social stigma (HIV, mental health, opioid dependence) in
 * MENA/Central Asia regions.
 *
 * ATC (Anatomical Therapeutic Chemical) codes are hierarchical:
 *   J05A   = Direct acting antivirals (HIV antiretrovirals)
 *   N05    = Psycholeptics (antipsychotics, anxiolytics, sedatives)
 *   N06    = Psychoanaleptics (antidepressants, psychostimulants)
 *   N07BC  = Drugs used in opioid dependence (methadone, buprenorphine)
 *
 * All logic is pure — no network calls, works entirely offline.
 */

/** ATC code prefixes that indicate sensitive medications */
const SENSITIVE_ATC_PREFIXES = ['J05A', 'N05', 'N06', 'N07BC'] as const

/**
 * Check whether a medication's ATC code belongs to a sensitive category.
 *
 * @param atcCode - The ATC classification code (e.g. "J05AF01", "N05AH03")
 * @returns `true` if the medication is in a sensitive category, `false` otherwise
 */
export function isSensitiveMedication(atcCode: string | null | undefined): boolean {
  if (!atcCode) return false

  const upper = atcCode.toUpperCase()
  return SENSITIVE_ATC_PREFIXES.some((prefix) => upper.startsWith(prefix))
}

/** Known ATC system URIs — match these specifically to avoid false positives */
const ATC_SYSTEM_PATTERNS = [
  'whocc.no/atc',
  'who-atc',
  '2.16.840.1.113883.6.73', // OID for ATC
] as const

/**
 * Extract ATC code from a FHIR CodeableConcept's coding array.
 * Matches known ATC system URIs to avoid false positives from unrelated
 * systems that happen to contain "ATC" in their URI.
 */
export function extractAtcCode(
  coding: Array<{ system?: string; code?: string }> | undefined,
): string | undefined {
  if (!coding) return undefined

  const atcEntry = coding.find(
    (c) =>
      c.system &&
      ATC_SYSTEM_PATTERNS.some((pattern) =>
        c.system!.toLowerCase().includes(pattern),
      ),
  )

  return atcEntry?.code
}
