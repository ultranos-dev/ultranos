/**
 * Shared sync-failure classifier.
 *
 * Maps a raw (opaque, possibly server-generated) sync failure reason to a stable
 * category key. Every spoke's sync UI uses this single source of truth so the
 * categories stay consistent across OPD-Lite, Pharmacy-Lite, and Lab-Lite.
 *
 * PHI safety (CLAUDE.md rule 1): a raw reason may be a Postgres error message
 * that embeds a column value (potentially PHI). This function only ever MATCHES
 * on structural tokens and RETURNS a fixed category key — the raw string is
 * never surfaced. Callers map the key to a localized, human-readable label.
 *
 * Order is most-specific first; the generic 'syncFailed' catch is last, and an
 * absent reason yields 'unknown'.
 */
export type SyncFailureCategory =
  | 'conflict'
  | 'networkError'
  | 'encryptionKey'
  | 'notPermitted'
  | 'prescriberUnknown'
  | 'clinicNotSetUp'
  | 'unsupportedType'
  | 'duplicateVisit'
  | 'serverRejected'
  | 'noResponse'
  | 'serverError'
  | 'syncFailed'
  | 'unknown'

/**
 * Every category, for exhaustive iteration (e.g. i18n-completeness tests in the
 * spokes that localize these). Keep in sync with SyncFailureCategory.
 */
export const SYNC_FAILURE_CATEGORIES: readonly SyncFailureCategory[] = [
  'conflict',
  'networkError',
  'encryptionKey',
  'notPermitted',
  'prescriberUnknown',
  'clinicNotSetUp',
  'unsupportedType',
  'duplicateVisit',
  'serverRejected',
  'noResponse',
  'serverError',
  'syncFailed',
  'unknown',
]

export function classifySyncFailure(
  rawReason: string | undefined | null,
  conflictFlag?: boolean,
): SyncFailureCategory {
  const raw = rawReason ?? ''
  const lower = raw.toLowerCase()

  // Conflicts have their own resolve flow — classify first.
  if (conflictFlag || lower.includes('conflict')) return 'conflict'

  // Transport level.
  if (raw.includes('HTTP 4')) return 'serverRejected'
  if (raw.includes('HTTP 5')) return 'serverError'
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('offline')
  ) {
    return 'networkError'
  }

  // Encryption / session key. Specific tokens only — never bare 'key' (a Postgres
  // unique-violation message also contains "Key (col)=(val)").
  if (lower.includes('decrypt') || lower.includes('encrypt') || lower.includes('awaiting-key')) {
    return 'encryptionKey'
  }

  // Hub op-level rejection codes emitted by sync.push (opaque, non-PHI).
  if (raw.includes('FORBIDDEN')) return 'notPermitted'
  if (raw.includes('UNKNOWN_PRACTITIONER')) return 'prescriberUnknown'
  if (raw.includes('MISSING_ORG_CONTEXT')) return 'clinicNotSetUp'
  if (raw.includes('Unknown resource type')) return 'unsupportedType'
  if (raw.includes('DUPLICATE_OPEN_ENCOUNTER')) return 'duplicateVisit'

  // Database rejection (Postgres upsert error) or a bare HTTP 4xx/5xx status
  // embedded in a message. Match structural tokens only.
  if (
    lower.includes('invalid input') ||
    lower.includes('violates') ||
    lower.includes('constraint') ||
    lower.includes('null value') ||
    lower.includes('duplicate key') ||
    /\b4\d\d\b/.test(raw)
  ) {
    return 'serverRejected'
  }
  if (/\b5\d\d\b/.test(raw) || lower.includes('internal')) return 'serverError'

  // Missing/empty responses from the Hub.
  if (lower.includes('empty response') || lower.includes('missing batch result')) {
    return 'noResponse'
  }

  if (raw) return 'syncFailed'
  return 'unknown'
}
