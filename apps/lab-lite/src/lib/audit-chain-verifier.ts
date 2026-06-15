// ============================================================
// Story 43.1 — Client-Side Audit Chain Verifier
// Provides offline cryptographic verification of the audit chain
// for a specific sample's lifecycle events.
//
// RULE: This function operates entirely offline — no Hub API calls.
//       It works on whatever events are currently in Dexie.
// RULE: No PHI — queries use sampleId (opaque lab ID only).
// ============================================================

import type Dexie from 'dexie'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import { getDb } from './db'

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

export interface AuditChainVerificationResult {
  valid: boolean
  checkedCount: number
  /** Event ID where the chain is broken (only present when valid === false). */
  brokenAt?: string
}

/**
 * Re-compute the SHA-256 chain hash for a stored audit event.
 * Uses Web Crypto API — browser-compatible, no Node.js dependency.
 *
 * Must use the same algorithm as DexieAuditAdapter.append() so hashes match.
 */
async function recomputeChainHash(
  prevHash: string,
  event: ClientAuditEvent,
): Promise<string> {
  const data = JSON.stringify({
    prevHash,
    id: event.id,
    timestamp: event.hlcTimestamp,
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    patientId: event.patientId ?? null,
    outcome: (event.metadata?.outcome as string) ?? null,
    metadata: event.metadata ?? null,
  })
  const encoded = new TextEncoder().encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify the audit chain integrity for a specific sample's lifecycle events.
 *
 * Queries the `clientAuditLog` Dexie table for all events where
 * `metadata.sampleId === sampleId`, ordered by `queuedAt` ascending (FIFO).
 * For each event, re-computes the SHA-256 hash and compares it against the
 * stored `chainHash`. Any mismatch indicates tampering.
 *
 * Returns:
 *   - `{ valid: true, checkedCount: N }` when all hashes verify
 *   - `{ valid: false, checkedCount: N, brokenAt: eventId }` when a mismatch is found
 *   - `{ valid: true, checkedCount: 0 }` when no events exist for the sampleId
 *
 * Works entirely offline — no Hub API calls required.
 * Never throws — returns { valid: false, checkedCount: 0 } on unexpected errors.
 *
 * @param sampleId  Opaque sample identifier (e.g. "LAB-20260601-0042")
 * @param table     Optional Dexie table override — defaults to the lab-lite
 *                  production clientAuditLog. Pass a fake-indexeddb table in tests.
 */
export async function verifyResultAuditChain(
  sampleId: string,
  table?: Dexie.Table<ClientAuditEvent, string>,
): Promise<AuditChainVerificationResult> {
  try {
    const auditTable = table ?? getDb().clientAuditLog

    // Full-table filter is acceptable in v1 (expected volume: ~1,000-1,400 events/day).
    // TODO: add index on metadata.sampleId if performance degrades
    const allEvents = await auditTable.toArray()

    // Filter to events for this sample and sort FIFO by queuedAt
    const sampleEvents = allEvents
      .filter(e => (e.metadata as Record<string, unknown> | undefined)?.sampleId === sampleId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

    if (sampleEvents.length === 0) {
      return { valid: true, checkedCount: 0 }
    }

    // Verify the per-resourceId hash chain.
    // The first event's prevHash is GENESIS_HASH; each subsequent event chains
    // off the previous event's stored chainHash (as written by DexieAuditAdapter).
    let prevHash = GENESIS_HASH

    for (let i = 0; i < sampleEvents.length; i++) {
      const event = sampleEvents[i]!

      // Events without a chainHash were stored before this feature was deployed.
      // Treat them as unverifiable rather than broken — reset the chain baseline.
      if (!event.chainHash) {
        prevHash = GENESIS_HASH
        continue
      }

      const expectedHash = await recomputeChainHash(prevHash, event)

      if (expectedHash !== event.chainHash) {
        return {
          valid: false,
          checkedCount: i + 1,
          brokenAt: event.id,
        }
      }

      prevHash = event.chainHash
    }

    return { valid: true, checkedCount: sampleEvents.length }
  } catch {
    // Never throw — offline verification must not crash clinical workflows.
    console.warn('[audit-chain-verifier] Verification failed — returning invalid result')
    return { valid: false, checkedCount: 0 }
  }
}
