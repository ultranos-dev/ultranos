// ============================================================
// SQLITE AUDIT STORE ADAPTER (Mobile)
// Append-only SQLite store for client audit events.
// Used by patient-lite-mobile (React Native + SQLCipher).
//
// RULE: Insert only — no update or delete on audit records.
// RULE: Indexed on status + queued_at for FIFO drain.
//
// NOTE: Patient-lite-mobile integration is deferred per story spec.
// This adapter is implemented for completeness and future use.
// ============================================================

import type { ClientAuditEvent, AuditStoreAdapter } from '../client.js'

/** Minimal SQLite interface matching expo-sqlite / react-native-quick-sqlite. */
export interface SQLiteDatabase {
  runAsync(sql: string, params?: unknown[]): Promise<void>
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS client_audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    patient_id TEXT,
    hlc_timestamp TEXT NOT NULL,
    metadata TEXT,
    queued_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )
`

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_client_audit_status_queued
  ON client_audit_log (status, queued_at)
`

export class SQLiteAuditAdapter implements AuditStoreAdapter {
  constructor(private readonly db: SQLiteDatabase) {}

  /** Create the audit table and index. Call once during app init. */
  async initialize(): Promise<void> {
    await this.db.runAsync(CREATE_TABLE_SQL)
    await this.db.runAsync(CREATE_INDEX_SQL)
  }

  async append(event: ClientAuditEvent): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO client_audit_log
       (id, actor_id, actor_role, action, resource_type, resource_id,
        patient_id, hlc_timestamp, metadata, queued_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.actorId,
        event.actorRole,
        event.action,
        event.resourceType,
        event.resourceId,
        event.patientId ?? null,
        event.hlcTimestamp,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.queuedAt,
        event.status,
      ],
    )
  }

  /** Fetch pending events in FIFO order for drain. */
  async getPending(limit: number): Promise<ClientAuditEvent[]> {
    const rows = await this.db.getAllAsync<{
      id: string
      actor_id: string
      actor_role: string
      action: string
      resource_type: string
      resource_id: string
      patient_id: string | null
      hlc_timestamp: string
      metadata: string | null
      queued_at: string
      status: string
    }>(
      `SELECT * FROM client_audit_log
       WHERE status = 'pending'
       ORDER BY queued_at ASC
       LIMIT ?`,
      [limit],
    )

    return rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorRole: row.actor_role as ClientAuditEvent['actorRole'],
      action: row.action as ClientAuditEvent['action'],
      resourceType: row.resource_type as ClientAuditEvent['resourceType'],
      resourceId: row.resource_id,
      patientId: row.patient_id ?? undefined,
      hlcTimestamp: row.hlc_timestamp,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      queuedAt: row.queued_at,
      status: row.status as ClientAuditEvent['status'],
    }))
  }

  async markSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    await this.db.runAsync(
      `UPDATE client_audit_log SET status = 'synced' WHERE id IN (${placeholders})`,
      ids,
    )
  }

  async markFailed(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    await this.db.runAsync(
      `UPDATE client_audit_log SET status = 'failed' WHERE id IN (${placeholders})`,
      ids,
    )
  }
}
