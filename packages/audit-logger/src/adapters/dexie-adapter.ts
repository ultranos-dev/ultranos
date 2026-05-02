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

export class DexieAuditAdapter implements AuditStoreAdapter {
  constructor(private readonly table: EntityTable<ClientAuditEvent, 'id'>) {}

  async append(event: ClientAuditEvent): Promise<void> {
    await this.table.add(event)
  }

  /** Fetch pending events in FIFO order for drain. */
  async getPending(limit: number): Promise<ClientAuditEvent[]> {
    return this.table
      .where('[status+queuedAt]')
      .between(['pending', Dexie.minKey], ['pending', Dexie.maxKey])
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
