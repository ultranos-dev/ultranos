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

/**
 * Order audit rows by their TRUE chain position, ascending.
 *
 * `chain_seq` (migration 045) is assigned inside the emit RPC's advisory lock, so
 * it strictly increases in insertion/chain order — unlike the JS `timestamp`, which
 * is stamped before the lock and can land out of order under concurrency. Rows that
 * predate chain_seq have `chain_seq = null` (append-only forbids backfilling them);
 * those are always chain-earlier than any seq'd row and fall back to timestamp order.
 */
function sortByChainOrderAsc<T extends { chain_seq?: number | string | null; timestamp: string; id: string }>(
  rows: T[],
): T[] {
  const isNull = (v: unknown) => v === null || v === undefined
  return [...rows].sort((a, b) => {
    const aNull = isNull(a.chain_seq)
    const bNull = isNull(b.chain_seq)
    if (aNull && bNull) {
      if (a.timestamp < b.timestamp) return -1
      if (a.timestamp > b.timestamp) return 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    }
    if (aNull) return -1 // legacy (null-seq) rows are chain-earlier than any seq'd row
    if (bNull) return 1
    return Number(a.chain_seq) - Number(b.chain_seq)
  })
}

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
  /**
   * @param db        Supabase client.
   * @param defaultOrgId  Tenant org applied to every emitted event when the
   *   event itself doesn't carry one. Required for the audit_log.org_id NOT NULL
   *   constraint — callers in a request context should pass ctx.user.orgId.
   */
  constructor(
    private readonly db: SupabaseClient,
    private readonly defaultOrgId?: string,
  ) {}

  async emit(input: AuditEventInput): Promise<AuditEvent> {
    // Generate id and timestamp in JS (preserves existing behavior).
    // NOTE: `timestamp` is the wall-clock time the event was observed — stamped
    // here, before the RPC's advisory lock. It is NOT the chain-ordering key.
    // Chain order is assigned inside the locked RPC as `chain_seq` (migration 045),
    // so concurrent emits whose JS timestamps land out of order still chain — and
    // verify (see verifyChain) — in true insertion order.
    const id = randomUUID()
    const timestamp = new Date().toISOString()

    // Atomic insert via PostgreSQL function with advisory lock.
    // This serializes concurrent writes so the hash chain never forks.
    // See: Story 21.6 — audit_emit_with_lock uses pg_advisory_xact_lock.
    const { data, error } = await this.db.rpc('audit_emit_with_lock', {
      p_id: id,
      p_timestamp: timestamp,
      p_actor_id: input.actorId ?? null,
      p_actor_role: input.actorRole,
      p_action: input.action,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId ?? null,
      p_patient_id: input.patientId ?? null,
      p_session_id: input.sessionId ?? null,
      p_device_id: input.deviceId ?? null,
      p_source_ip_hash: input.sourceIpHash ?? null,
      p_outcome: input.outcome,
      p_denial_reason: input.denialReason ?? null,
      p_metadata: input.metadata ?? null,
      p_org_id: input.orgId ?? this.defaultOrgId ?? null,
    })

    if (error) {
      // Propagate — a logging failure is a compliance failure
      throw new Error(`[AuditLogger] Insert failed: ${error.message}`)
    }

    const row = Array.isArray(data) ? data[0] : data

    if (!row?.chain_hash) {
      throw new Error('[AuditLogger] Insert failed: RPC returned no row or missing chain_hash')
    }

    return {
      id,
      timestamp,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      sourceIpHash: input.sourceIpHash,
      outcome: input.outcome,
      denialReason: input.denialReason,
      chainHash: row.chain_hash,
      orgId: input.orgId ?? this.defaultOrgId,
      metadata: input.metadata,
    }
  }

  // Verify hash chain integrity. By default checks the most recent entries (newest = true).
  // Set newest = false to check from the beginning (legacy behavior).
  async verifyChain(limit = 100, opts?: { newest?: boolean }): Promise<{ valid: boolean; checkedCount: number; brokenAt?: string }> {
    const newest = opts?.newest ?? true

    if (newest) {
      // Fetch limit+1 entries (the extra entry provides the baseline hash)
      const { data: descRows, error } = await this.db
        .from(AUDIT_TABLE)
        .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, patient_id, outcome, chain_hash, chain_seq')
        .order('timestamp', { ascending: false })
        .limit(limit + 1)

      if (error || !descRows) return { valid: false, checkedCount: 0, brokenAt: 'query_failed' }

      // Order by TRUE chain position (chain_seq), not wall-clock timestamp — concurrent
      // emits can be stored with timestamps out of order relative to insertion order.
      // If no row in the window carries a chain_seq (pre-migration data), preserve the
      // original timestamp ordering exactly (reverse of the DESC fetch).
      const rows = descRows.some((r: { chain_seq?: number | string | null }) => r.chain_seq != null)
        ? sortByChainOrderAsc(descRows)
        : descRows.reverse()

      if (rows.length === 0) return { valid: true, checkedCount: 0 }

      // If we got limit+1 rows, the first is the baseline (its hash is trusted).
      // If we got fewer, we reached the beginning of the table — start from GENESIS_HASH.
      let prevHash: string
      let startIdx: number
      if (rows.length > limit) {
        prevHash = rows[0]!.chain_hash
        startIdx = 1
      } else {
        prevHash = GENESIS_HASH
        startIdx = 0
      }

      let checkedCount = 0
      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i]!
        const expected = computeChainHash(prevHash, {
          id: row.id, timestamp: row.timestamp, actorId: row.actor_id,
          actorRole: row.actor_role, action: row.action, resourceType: row.resource_type,
          resourceId: row.resource_id, patientId: row.patient_id, outcome: row.outcome,
          sessionId: undefined, deviceId: undefined, sourceIpHash: undefined, denialReason: undefined,
        })
        checkedCount++
        if (expected !== row.chain_hash) {
          return { valid: false, checkedCount, brokenAt: row.id }
        }
        prevHash = row.chain_hash
      }
      return { valid: true, checkedCount }
    }

    // Legacy: verify from the beginning (oldest first)
    const { data: ascRows, error } = await this.db
      .from(AUDIT_TABLE)
      .select('id, timestamp, actor_id, actor_role, action, resource_type, resource_id, patient_id, outcome, chain_hash, chain_seq')
      .order('timestamp', { ascending: true })
      .limit(limit)

    if (error || !ascRows) return { valid: false, checkedCount: 0, brokenAt: 'query_failed' }

    // Order by true chain position (chain_seq); fall back to the original ascending
    // timestamp order when no row carries a chain_seq (pre-migration data). See newest branch.
    const rows = ascRows.some((r: { chain_seq?: number | string | null }) => r.chain_seq != null)
      ? sortByChainOrderAsc(ascRows)
      : ascRows

    let prevHash = GENESIS_HASH
    let checkedCount = 0
    for (const row of rows) {
      const expected = computeChainHash(prevHash, {
        id: row.id, timestamp: row.timestamp, actorId: row.actor_id,
        actorRole: row.actor_role, action: row.action, resourceType: row.resource_type,
        resourceId: row.resource_id, patientId: row.patient_id, outcome: row.outcome,
        sessionId: undefined, deviceId: undefined, sourceIpHash: undefined, denialReason: undefined,
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
