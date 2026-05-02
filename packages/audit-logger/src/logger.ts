import { createHash, randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditEvent, AuditEventInput } from '@ultranos/shared-types'

// ============================================================
// ULTRANOS AUDIT LOGGER
// Append-only, SHA-256 hash-chained audit event emitter.
// PRD Section 12 — every PHI access MUST emit an event.
//
// RULE: This function MUST NOT throw silently.
// A failure to log is a compliance failure. Propagate errors up.
// RULE: Never put PHI in the metadata field. Use opaque IDs only.
// ============================================================

const AUDIT_TABLE = 'audit_log'
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

function computeChainHash(prevHash: string, event: AuditEventInput & { id: string; timestamp: string }): string {
  const data = JSON.stringify({
    prevHash,
    id: event.id,
    timestamp: event.timestamp,
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    patientId: event.patientId,
    outcome: event.outcome,
  })
  return createHash('sha256').update(data).digest('hex')
}

export class AuditLogger {
  constructor(private readonly db: SupabaseClient) {}

  async emit(input: AuditEventInput): Promise<AuditEvent> {
    // 1. Get previous chain hash for continuity
    const { data: lastRow } = await this.db
      .from(AUDIT_TABLE)
      .select('chain_hash')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    const prevHash = lastRow?.chain_hash ?? GENESIS_HASH

    // 2. Build the event record
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const partial = { ...input, id, timestamp }
    const chainHash = computeChainHash(prevHash, partial)

    const event: AuditEvent = {
      ...partial,
      chainHash,
    }

    // 3. Insert — NEVER update or delete audit records
    const { error } = await this.db.from(AUDIT_TABLE).insert({
      id: event.id,
      timestamp: event.timestamp,
      actor_id: event.actorId,
      actor_role: event.actorRole,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId,
      patient_id: event.patientId,
      session_id: event.sessionId,
      device_id: event.deviceId,
      source_ip_hash: event.sourceIpHash,
      outcome: event.outcome,
      denial_reason: event.denialReason,
      chain_hash: event.chainHash,
      metadata: event.metadata ?? null,
    })

    if (error) {
      // Propagate — a logging failure is a compliance failure
      throw new Error(`[AuditLogger] Insert failed: ${error.message}`)
    }

    return event
  }

  // Verify hash chain integrity from startId to latest
  async verifyChain(limit = 100): Promise<{ valid: boolean; checkedCount: number; brokenAt?: string }> {
    const { data: rows, error } = await this.db
      .from(AUDIT_TABLE)
      .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, patient_id, outcome, chain_hash')
      .order('timestamp', { ascending: true })
      .limit(limit)

    if (error || !rows) return { valid: false, checkedCount: 0, brokenAt: 'query_failed' }

    let prevHash = GENESIS_HASH
    let checkedCount = 0
    for (const row of rows) {
      const expected = computeChainHash(prevHash, {
        id: row.id,
        timestamp: row.timestamp,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        patientId: row.patient_id,
        outcome: row.outcome,
        sessionId: undefined,
        deviceId: undefined,
        sourceIpHash: undefined,
        denialReason: undefined,
      })
      checkedCount++
      if (expected !== row.chain_hash) {
        return { valid: false, checkedCount, brokenAt: row.id }
      }
      prevHash = row.chain_hash
    }
    return { valid: true, checkedCount }
  }
}
