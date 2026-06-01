// ============================================================
// DEXIE AUDIT STORE ADAPTER (PWA)
// Append-only IndexedDB store for client audit events.
// Used by opd-lite and pharmacy-lite PWAs.
//
// RULE: Insert only — no update or delete on audit records.
// RULE: Indexed on status + queuedAt for FIFO drain.
// ============================================================

import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { ClientAuditEvent, AuditStoreAdapter } from '../client.js'

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Compute a SHA-256 chain hash for a client-side audit event.
 * Uses Web Crypto API (browser-compatible, no Node.js crypto).
 *
 * Hash input matches the Hub-side computeChainHash() structure, with metadata
 * included for stronger client-side tamper detection.
 */
async function computeClientChainHash(
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

export class DexieAuditAdapter implements AuditStoreAdapter {
  constructor(private readonly table: EntityTable<ClientAuditEvent, 'id'>) {}

  /**
   * Append a new audit event to the local store.
   * Computes a SHA-256 chain hash linking to the previous event with the same
   * resourceId (per-resource chain). The genesis event for a resourceId uses
   * GENESIS_HASH as prevHash.
   *
   * Chain hash includes metadata so any field modification breaks the chain.
   */
  async append(event: ClientAuditEvent): Promise<void> {
    try {
      // Find the most recent event for the same resourceId to link the chain.
      // Per-resourceId chaining means each sample/result has its own verifiable chain.
      // Full-table filter is acceptable in v1 (expected volume: ~1,000-1,400 events/day).
      // TODO: add resourceId index if performance degrades
      const allEvents = await this.table.toArray()
      const prevEvents = allEvents
        .filter(e => e.resourceId === event.resourceId)
        .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

      const prevEvent = prevEvents.length > 0 ? prevEvents[prevEvents.length - 1] : null
      const prevHash = prevEvent?.chainHash ?? GENESIS_HASH

      const chainHash = await computeClientChainHash(prevHash, event)
      await this.table.add({ ...event, chainHash })
    } catch {
      // Fallback: store without chain hash rather than drop the event entirely.
      // Chain verification will treat missing chainHash as unverifiable (not broken).
      await this.table.add(event)
    }
  }

  /** Fetch pending events in FIFO order for drain. */
  async getPending(limit: number): Promise<ClientAuditEvent[]> {
    return this.table
      .where('[status+queuedAt]')
      .between(['pending', ''], ['pending', '\uffff'])
      .limit(limit)
      .toArray()
  }

  /** Mark events as synced after successful Hub delivery. */
  async markSynced(ids: string[]): Promise<void> {
    await this.table
      .where('id')
      .anyOf(ids)
      .modify({ status: 'synced' })
  }

  /** Mark events as failed after max retries exhausted. */
  async markFailed(ids: string[]): Promise<void> {
    await this.table
      .where('id')
      .anyOf(ids)
      .modify({ status: 'failed' })
  }
}

/**
 * Add the clientAuditLog table to an existing Dexie database.
 * Call this in your Dexie version upgrade chain.
 *
 * Schema: append-only, indexed on status + queuedAt for FIFO drain.
 * Not encrypted — contains only opaque IDs, no PHI.
 */
export const CLIENT_AUDIT_TABLE_NAME = 'clientAuditLog'
export const CLIENT_AUDIT_SCHEMA = 'id, status, queuedAt, [status+queuedAt]'
