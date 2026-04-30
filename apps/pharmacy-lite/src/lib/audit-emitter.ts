/**
 * Browser-compatible audit event emitter for Pharmacy Lite PWA.
 *
 * The shared @ultranos/audit-logger (AuditLogger class) is server-only:
 * it depends on Node.js `crypto.createHash` and a SupabaseClient for
 * direct DB inserts with SHA-256 hash chaining. It cannot run in the
 * browser environment.
 *
 * This module provides a lightweight bridge that:
 *   1. Builds a structured AuditEventInput matching the shared schema.
 *   2. Queues it in the local Dexie sync queue so it will be sent to the
 *      Hub API on next sync. The Hub API then feeds it through the real
 *      AuditLogger (with hash chaining) server-side.
 *   3. If the sync queue write fails, the error is logged to console
 *      (without PHI) but NOT swallowed — callers should handle it.
 *
 * This satisfies CLAUDE.md healthcare safety rule #6: every PHI access
 * emits a structured audit event via the shared audit trail.
 */

import type { AuditEventInput } from '@ultranos/shared-types'
import { db } from '@/lib/db'

/**
 * Queue a structured audit event for sync to the Hub API.
 *
 * The event is stored in the local `pendingAuditEvents` Dexie table and
 * will be picked up by the sync engine on next connectivity window. The
 * Hub API will then insert it via the real AuditLogger with hash chaining.
 *
 * @throws if the local Dexie write fails — audit failures are compliance
 *         failures and must not be silently swallowed.
 */
export async function emitAuditEvent(input: AuditEventInput): Promise<void> {
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
    _syncStatus: 'pending' as const,
  }

  await db.pendingAuditEvents.add(record)
}
