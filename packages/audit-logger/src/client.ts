// ============================================================
// CLIENT-SIDE AUDIT EMITTER
// Browser/RN-compatible audit event emitter for spoke apps.
// Queues events to a local store (injected via platform adapter)
// for later sync to the Hub API.
//
// RULE: emitClientAudit() must NEVER throw or block the caller.
// Audit failures must not prevent clinical workflows.
// RULE: No PHI in metadata — only opaque IDs and action types.
// ============================================================

import type {
  AuditAction,
  AuditOutcome,
  AuditResourceType,
  UserRole,
} from '@ultranos/shared-types'

// ============================================================
// METADATA WHITELIST SCHEMA (replaces the old 28-name blocklist)
//
// A blocklist can only reject the specific field names it knows about — any
// new/renamed PHI field (or PHI hidden in an array element, which the old guard
// skipped entirely) slips through. Rule #1 needs the opposite default: reject
// unless provably safe. So metadata is validated against a WHITELIST OF SHAPES —
// audit context is, by design, opaque IDs / enums / counts / flags / timestamps,
// never free clinical text. Anything that isn't one of these shapes is dropped.
//
//   allowed value shapes:
//     - string   (length ≤ MAX_STRING_LEN — a clinical note / name can't hide here)
//     - number | boolean | null
//     - array    of the above scalars (recursed — fixes the old array-skip bug)
//     - object   ONE level deep, whose values are the above scalars/scalar-arrays
//   rejected: nested objects deeper than one level, functions, symbols, bigints,
//     over-length strings, and any known-PHI field NAME (belt-and-suspenders).
//
// Enforced identically on the client (here) and server-side in emit().
// ============================================================

/** Max length for any string metadata value. Opaque IDs, enums, ISO timestamps and
 *  short codes are all well under this; free-text (names, notes) is not. */
export const MAX_METADATA_STRING_LEN = 256

/** Belt-and-suspenders: field NAMES that are never allowed even if the value shape
 *  would pass (e.g. a short `name` string). The shape whitelist is the primary guard. */
const PHI_FIELD_NAMES = new Set([
  'name',
  'firstName',
  'lastName',
  'givenName',
  'familyName',
  'birthDate',
  'dateOfBirth',
  'dob',
  'address',
  'phone',
  'email',
  'telecom',
  'ssn',
  'nationalId',
  'diagnosis',
  'diagnosisText',
  'medicationName',
  'medicationDisplay',
  'allergyName',
  'allergyDisplay',
  'noteText',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'clinicalNote',
  'photo',
])

/** A scalar value permitted anywhere in metadata (incl. inside arrays / shallow objects). */
function isAllowedScalar(v: unknown): boolean {
  if (v === null) return true
  const t = typeof v
  if (t === 'number' || t === 'boolean') return true
  if (t === 'string') return (v as string).length <= MAX_METADATA_STRING_LEN
  return false
}

/**
 * Sanitize one metadata value against the shape whitelist.
 * Returns `{ ok: true, value }` with the (possibly recursed) sanitized value, or
 * `{ ok: false }` if the value's shape is not allowed at this depth.
 *
 * @param depth 0 = top-level metadata property, 1 = inside a shallow object. Objects
 *   are permitted at depth 0 only (one level of nesting); deeper nesting is rejected.
 */
function sanitizeValue(value: unknown, depth: number): { ok: true; value: unknown } | { ok: false } {
  if (isAllowedScalar(value)) return { ok: true, value }

  if (Array.isArray(value)) {
    // Arrays may contain scalars OR (at depth 0) shallow objects — recurse into each
    // element (this is the fix for the old guard, which skipped arrays entirely so PHI
    // inside an array element was never inspected).
    const out: unknown[] = []
    for (const el of value) {
      const r = sanitizeValue(el, depth + 1)
      if (!r.ok) return { ok: false }
      out.push(r.value)
    }
    return { ok: true, value: out }
  }

  if (value && typeof value === 'object' && depth === 0) {
    // One level of nested object, values must be scalars or scalar-arrays.
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (PHI_FIELD_NAMES.has(key)) return { ok: false }
      const r = sanitizeValue((value as Record<string, unknown>)[key], depth + 1)
      if (!r.ok) return { ok: false }
      out[key] = r.value
    }
    return { ok: true, value: out }
  }

  // Deeper objects, functions, symbols, bigints, over-length strings → rejected.
  return { ok: false }
}

/**
 * Validate metadata against the whitelist schema. Returns a sanitized copy containing
 * only whitelisted-shape properties, plus the list of dropped key paths (for logging).
 * Never throws.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): { sanitized: Record<string, unknown>; dropped: string[] } {
  const sanitized: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const key of Object.keys(metadata)) {
    if (PHI_FIELD_NAMES.has(key)) {
      dropped.push(key)
      continue
    }
    const r = sanitizeValue(metadata[key], 0)
    if (r.ok) {
      sanitized[key] = r.value
    } else {
      dropped.push(key)
    }
  }
  return { sanitized, dropped }
}

export type ClientAuditEventStatus = 'pending' | 'synced' | 'failed'

export interface ClientAuditEvent {
  id: string
  actorId: string
  actorRole: UserRole
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  patientId?: string
  hlcTimestamp: string
  metadata?: Record<string, unknown>
  queuedAt: string // ISO 8601
  status: ClientAuditEventStatus
  /** SHA-256 hash linking this event to the previous event in the per-resource chain. */
  chainHash?: string
}

export type ClientAuditEventInput = Omit<ClientAuditEvent, 'id' | 'queuedAt' | 'status'>

/** Platform adapter interface — Dexie for PWA, SQLite for mobile. */
export interface AuditStoreAdapter {
  append(event: ClientAuditEvent): Promise<void>
}

let _adapter: AuditStoreAdapter | null = null

/**
 * Register the platform-specific store adapter.
 * Must be called once during app initialization.
 */
export function setAuditStoreAdapter(adapter: AuditStoreAdapter): void {
  _adapter = adapter
}

/**
 * Emit a client-side audit event.
 *
 * - Never throws — clinical workflows must not be blocked by audit failures.
 * - Validates metadata against the whitelist schema at runtime (any value whose
 *   shape isn't allowed, or whose key is a known PHI field name, is dropped).
 * - Queues the event to the local store for later Hub sync.
 */
export async function emitClientAudit(input: ClientAuditEventInput): Promise<void> {
  try {
    // Runtime PHI guard — whitelist shapes, not a name blocklist.
    if (input.metadata) {
      const { sanitized, dropped } = sanitizeAuditMetadata(input.metadata)
      if (dropped.length > 0) {
        console.warn(
          `[audit] metadata keys dropped (not whitelisted): ${dropped.join(', ')}`,
        )
        input = { ...input, metadata: sanitized }
      }
    }

    if (!_adapter) {
      console.warn('[audit] No store adapter registered — event dropped')
      return
    }

    const event: ClientAuditEvent = {
      ...input,
      id: crypto.randomUUID(),
      queuedAt: new Date().toISOString(),
      status: 'pending',
    }

    await _adapter.append(event)
  } catch {
    // Best-effort: never throw, never block clinical workflows
    console.warn('[audit] Failed to queue audit event — continuing')
  }
}
