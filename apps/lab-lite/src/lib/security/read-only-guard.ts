/**
 * Story 49.4 — Read-Only Mode Guard
 *
 * When Security Alert is active, all writes to PHI tables are blocked.
 * This module provides:
 *   - SecurityModeError — thrown on blocked write attempts
 *   - isReadOnlyMode() — checks current store state
 *   - setReadOnlyBypass(active) — temporarily bypasses for privileged ops
 *   - installReadOnlyGuard(db) — installs Dexie DBCore middleware
 *
 * The middleware intercepts all mutate() calls on PHI tables and throws
 * SecurityModeError if readOnlyMode is active (unless bypass is enabled).
 */

import type Dexie from 'dexie'

/** Thrown when a write is attempted while Security Mode is active. */
export class SecurityModeError extends Error {
  constructor(message = 'Write blocked: Security Mode is active') {
    super(message)
    this.name = 'SecurityModeError'
  }
}

// Inlined here to avoid circular: read-only-guard → emergency-encrypt → db → read-only-guard
// Must match PHI_TABLES in emergency-encrypt.ts
const PHI_TABLE_SET = new Set([
  'patients',
  'uploadQueue',
  'verified_patients',
  'syncQueue',
  'practitioner_keys',
  'consentRecords',
  'culturalPreferences',
  'lab_results',
  'samples',
  'smsQueue',
  'patientVerifications',
  'custody_events',
  'orders',
  'payments',
  'employee_health_records',
  'queueEntries',
  'amendments',
  'incident_reports',
  'labLogbook',
])

/** Track which Dexie instances have the guard installed (prevents double-install). */
const _installedInstances = new WeakSet<Dexie>()

/** Module-level flag — updated by the security-alert-store on activate/deactivate. */
let _readOnlyActive = false

/** Temporary bypass for privileged operations (encryption, wipe, restoration). */
let _bypassActive = false

/**
 * Called by the security-alert-store when Security Alert is activated or deactivated.
 * Keeps this module free of any dependency on the store (avoids circular imports).
 */
export function setReadOnlyMode(active: boolean): void {
  _readOnlyActive = active
}

/**
 * Returns true if Security Alert mode is currently active.
 * Synchronous and dependency-free.
 */
export function isReadOnlyMode(): boolean {
  return _readOnlyActive
}

/**
 * Temporarily bypass the read-only guard for privileged operations
 * (emergency encryption, device wipe, restoration).
 * Call setReadOnlyBypass(false) when the privileged operation is done.
 */
export function setReadOnlyBypass(active: boolean): void {
  _bypassActive = active
}

/**
 * Install a Dexie DBCore middleware that blocks all mutations on PHI tables
 * when Security Mode is active. Safe to call multiple times per instance.
 */
export function installReadOnlyGuard(db: Dexie): void {
  if (_installedInstances.has(db)) return
  _installedInstances.add(db)
  db.use({
    stack: 'dbcore',
    name: 'SecurityReadOnlyGuard',
    create(downlevel) {
      return {
        ...downlevel,
        table(name: string) {
          const table = downlevel.table(name)
          if (!PHI_TABLE_SET.has(name)) return table

          return {
            ...table,
            mutate(req: Parameters<typeof table.mutate>[0]) {
              if (isReadOnlyMode() && !_bypassActive) {
                throw new SecurityModeError(
                  `Write to '${name}' blocked: Security Mode is active`,
                )
              }
              return table.mutate(req)
            },
          }
        },
      }
    },
  })
}
