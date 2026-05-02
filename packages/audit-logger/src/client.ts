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

/** Fields that must never appear in audit event metadata. */
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
 * Validate that metadata does not contain known PHI field names.
 * Recursively inspects nested objects.
 * Returns the list of offending key paths (empty if clean).
 */
function findPhiFields(obj: Record<string, unknown>, prefix = ''): string[] {
  const violations: string[] = []
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (PHI_FIELD_NAMES.has(key)) {
      violations.push(path)
    }
    const val = obj[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      violations.push(...findPhiFields(val as Record<string, unknown>, path))
    }
  }
  return violations
}

/**
 * Emit a client-side audit event.
 *
 * - Never throws — clinical workflows must not be blocked by audit failures.
 * - Validates metadata contains no PHI field names at runtime.
 * - Queues the event to the local store for later Hub sync.
 */
export async function emitClientAudit(input: ClientAuditEventInput): Promise<void> {
  try {
    // Runtime PHI guard
    if (input.metadata) {
      const violations = findPhiFields(input.metadata)
      if (violations.length > 0) {
        console.warn(
          `[audit] PHI field names detected in metadata — stripped: ${violations.join(', ')}`,
        )
        const cleaned = structuredClone(input.metadata)
        for (const path of violations) {
          const parts = path.split('.')
          let target: Record<string, unknown> = cleaned
          for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]] as Record<string, unknown>
          }
          delete target[parts[parts.length - 1]]
        }
        input = { ...input, metadata: cleaned }
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
