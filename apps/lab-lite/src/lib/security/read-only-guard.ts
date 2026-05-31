/**
 * Story 49.4 — Read-Only Mode Guard
 *
 * When Security Alert is active, all writes to PHI tables are blocked.
 * This module provides:
 *   - SecurityModeError — thrown on blocked write attempts
 *   - isReadOnlyMode() — checks current store state
 *   - installReadOnlyGuard(db) — installs Dexie DBCore middleware
 *
 * The middleware intercepts all mutate() calls on PHI tables and throws
 * SecurityModeError if readOnlyMode is active.
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
const PHI_TABLE_SET = new Set([
  'patients',
  'uploadQueue',
  'verified_patients',
  'syncQueue',
  'practitioner_keys',
  'consentRecords',
  'culturalPreferences',
])

/** Prevent double-installation on the same Dexie instance. */
let _guardInstalled = false

/** Module-level flag — updated by the security-alert-store on activate/deactivate. */
let _readOnlyActive = false

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
 * Install a Dexie DBCore middleware that blocks all mutations on PHI tables
 * when Security Mode is active. Safe to call multiple times — installs once.
 */
export function installReadOnlyGuard(db: Dexie): void {
  if (_guardInstalled) return
  _guardInstalled = true
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
              if (isReadOnlyMode()) {
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
