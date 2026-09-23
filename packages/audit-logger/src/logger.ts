import { createHash, randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeAuditMetadata } from './client.js'
import type {
  AuditEvent,
  AuditEventInput,
  AuditAction,
  AuditOutcome,
  AuditResourceType,
  UserRole,
} from '@ultranos/shared-types'

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

// ── Chain versions ───────────────────────────────────────────
// LEGACY (1): the original 10-column hash (prevHash + id/timestamp/actorId/actorRole/
//   action/resourceType/resourceId/patientId/outcome). Rows written before this story
//   carry chain_version = 1 or NULL and MUST still verify under the legacy hash.
// FULL_ROW (2): a canonical hash of the FULL row — the legacy 10 columns PLUS
//   sessionId, deviceId, sourceIpHash, denialReason, orgId, and a canonicalized
//   metadata object — so those previously-unchained columns are now tamper-evident.
export const CHAIN_VERSION_LEGACY = 1
export const CHAIN_VERSION_FULL_ROW = 2
/** Version stamped on all NEW rows written by this logger. */
export const CURRENT_CHAIN_VERSION = CHAIN_VERSION_FULL_ROW

/**
 * Canonically serialize a JSON value to a compact TEXT string so both the JS verifier
 * and the PostgreSQL write path (jsonb_canonical_text) produce byte-identical output:
 *  - object keys are sorted lexicographically (recursively) — Postgres native jsonb
 *    key order (length-then-bytes) does NOT match JS, so we sort explicitly on both sides,
 *  - null object properties are dropped (json_strip_nulls parity),
 *  - arrays keep their order (array null elements are kept as null),
 *  - scalars are emitted by JSON.stringify.
 *
 * The hashed `metadata` field is this STRING (a JSON string value), not a nested object.
 * Emitting it as a string sidesteps jsonb re-normalization on the PG side: the RPC hashes
 * `json_build_object(..., 'metadata', jsonb_canonical_text(p_metadata))` where
 * jsonb_canonical_text returns text, so it lands in the payload as an identical JSON string.
 */
function canonicalJsonText(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJsonText(v))).join(',') + ']'
  }
  if (typeof value === 'object') {
    const parts: string[] = []
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v === null || v === undefined) continue // json_strip_nulls parity
      parts.push(JSON.stringify(key) + ':' + canonicalJsonText(v))
    }
    return '{' + parts.join(',') + '}'
  }
  return JSON.stringify(value)
}

/**
 * Order audit rows by their TRUE chain position, ascending.
 *
 * `chain_seq` (migration 045) is assigned inside the emit RPC's advisory lock, so
 * it strictly increases in insertion/chain order — unlike the JS `timestamp`, which
 * is stamped before the lock and can land out of order under concurrency. Rows that
 * predate chain_seq have `chain_seq = null` (append-only forbids backfilling them);
 * those are always chain-earlier than any seq'd row and fall back to timestamp order.
 */
function sortByChainOrderAsc<T extends Record<string, unknown>>(rows: T[]): T[] {
  const isNull = (v: unknown) => v === null || v === undefined
  const ts = (r: T) => String(r.timestamp ?? '')
  const idOf = (r: T) => String(r.id ?? '')
  return [...rows].sort((a, b) => {
    const aNull = isNull(a.chain_seq)
    const bNull = isNull(b.chain_seq)
    if (aNull && bNull) {
      if (ts(a) < ts(b)) return -1
      if (ts(a) > ts(b)) return 1
      return idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0
    }
    if (aNull) return -1 // legacy (null-seq) rows are chain-earlier than any seq'd row
    if (bNull) return 1
    return Number(a.chain_seq) - Number(b.chain_seq)
  })
}

/**
 * Compute the chain hash for a row, dispatching on chain version.
 *
 * Parity with the write path (audit_emit_with_lock RPC), which stores the hash as
 *   encode(digest(json_strip_nulls(json_build_object('prevHash',…,'timestamp',p_timestamp,…))::text,'sha256'),'hex')
 * over the ORIGINAL ISO timestamp text. To validate the server-stored chain, verify must:
 *   1. OMIT null/undefined fields (json_strip_nulls parity). Supabase returns null for empty
 *      columns, so serialising them as "key":null would never match the stored hash.
 *   2. Use the canonical ms-precision ISO (…Z) that emit stamped; the timestamptz column
 *      serialises as …+00:00 on read, so normalise it back before hashing.
 *
 * LEGACY (v1): the original 10 fields only.
 * FULL_ROW (v2): the 10 legacy fields PLUS sessionId, deviceId, sourceIpHash,
 *   denialReason, orgId, and a canonicalized metadata object (key-sorted, null-stripped)
 *   — matching the RPC's json_build_object(... , 'metadata', jsonb_canonical(...)).
 */
function computeChainHash(
  prevHash: string,
  event: AuditEventInput & {
    id: string
    timestamp: string
    sessionId?: string
    deviceId?: string
    sourceIpHash?: string
    denialReason?: string
    orgId?: string
    metadata?: Record<string, unknown> | null
  },
  chainVersion: number = CHAIN_VERSION_LEGACY,
): string {
  const fields: Array<[string, unknown]> = [
    ['prevHash', prevHash],
    ['id', event.id],
    ['timestamp', new Date(event.timestamp).toISOString()],
    ['actorId', event.actorId],
    ['actorRole', event.actorRole],
    ['action', event.action],
    ['resourceType', event.resourceType],
    ['resourceId', event.resourceId],
    ['patientId', event.patientId],
    ['outcome', event.outcome],
  ]

  if (chainVersion >= CHAIN_VERSION_FULL_ROW) {
    // Append the previously-unchained columns. Order matches the RPC's
    // json_build_object insertion order exactly (JSON.stringify preserves it).
    fields.push(
      ['sessionId', event.sessionId],
      ['deviceId', event.deviceId],
      ['sourceIpHash', event.sourceIpHash],
      ['denialReason', event.denialReason],
      ['orgId', event.orgId],
    )
    // metadata is a canonical JSON STRING (key-sorted, null-stripped) — matching the RPC's
    // json_build_object(..., 'metadata', jsonb_canonical_text(p_metadata)). Null metadata is
    // stripped entirely (json_strip_nulls parity), so only push it when present.
    if (event.metadata !== null && event.metadata !== undefined) {
      fields.push(['metadata', canonicalJsonText(event.metadata)])
    }
  }

  const payload: Record<string, unknown> = {}
  for (const [key, value] of fields) {
    if (value !== null && value !== undefined) payload[key] = value
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
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

    // Server-side metadata whitelist (Rule #1). The same shape whitelist the client
    // enforces is applied here too, so an event that reaches the Hub by any path
    // (client sync OR a server-originated emit) can never persist non-whitelisted
    // metadata into the (now hash-covered) metadata column.
    const metadata = input.metadata
      ? sanitizeAuditMetadata(input.metadata).sanitized
      : input.metadata

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
      p_metadata: metadata ?? null,
      p_org_id: input.orgId ?? this.defaultOrgId ?? null,
      // Chain vNext: stamp the full-row hash version on every new row. The RPC hashes
      // the full row when this is >= 2; legacy rows carry version 1 / NULL and remain
      // verifiable under the legacy 10-column hash (see verifyChain dispatch).
      // ⚠️ DEPLOY ORDERING: migration 063 (adds the p_chain_version arg + full-row hashing)
      //    MUST be applied BEFORE this code ships — the pre-063 RPC does not accept this
      //    named arg and PostgREST would 404 the call. Migration authored, apply at deploy.
      p_chain_version: CURRENT_CHAIN_VERSION,
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
      // Widened emit-input strings cast back to the canonical enum types for the
      // stored AuditEvent. Values are byte-identical to the enum members (the input
      // union is `${Enum}`), so this is a nominal-typing bridge, not a value change.
      actorRole: input.actorRole as UserRole,
      action: input.action as AuditAction,
      resourceType: input.resourceType as AuditResourceType,
      resourceId: input.resourceId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      sourceIpHash: input.sourceIpHash,
      outcome: input.outcome as AuditOutcome,
      denialReason: input.denialReason,
      chainHash: row.chain_hash,
      orgId: input.orgId ?? this.defaultOrgId,
      metadata,
    }
  }

  // Verify hash chain integrity. By default checks the most recent entries (newest = true).
  // Set newest = false to check from the beginning (legacy behavior).
  async verifyChain(limit = 100, opts?: { newest?: boolean }): Promise<{ valid: boolean; checkedCount: number; brokenAt?: string }> {
    const newest = opts?.newest ?? true

    // Columns needed to recompute BOTH chain versions. The vNext (full-row) hash also
    // covers session_id/device_id/source_ip_hash/denial_reason/org_id/metadata, so we
    // must select them; legacy rows simply ignore them during recompute.
    const SELECT_COLS =
      'id, timestamp, actor_id, actor_role, action, resource_type, resource_id, patient_id, ' +
      'session_id, device_id, source_ip_hash, denial_reason, org_id, outcome, metadata, chain_hash, chain_seq, chain_version'

    // Recompute a row's expected hash, dispatching on its stored chain_version.
    // Rows with chain_version null or 1 verify under the legacy 10-column hash; rows
    // with chain_version >= 2 verify under the full-row canonical hash. This per-row
    // dispatch is what keeps LEGACY rows verifiable across the version boundary.
    const expectedFor = (prevHash: string, row: Record<string, unknown>): string => {
      const version = row.chain_version == null ? CHAIN_VERSION_LEGACY : Number(row.chain_version)
      return computeChainHash(
        prevHash,
        {
          id: row.id as string,
          timestamp: row.timestamp as string,
          actorId: (row.actor_id as string) ?? undefined,
          actorRole: row.actor_role as AuditEventInput['actorRole'],
          action: row.action as AuditEventInput['action'],
          resourceType: row.resource_type as AuditEventInput['resourceType'],
          resourceId: (row.resource_id as string) ?? undefined,
          patientId: (row.patient_id as string) ?? undefined,
          outcome: row.outcome as AuditEventInput['outcome'],
          sessionId: (row.session_id as string) ?? undefined,
          deviceId: (row.device_id as string) ?? undefined,
          sourceIpHash: (row.source_ip_hash as string) ?? undefined,
          denialReason: (row.denial_reason as string) ?? undefined,
          orgId: (row.org_id as string) ?? undefined,
          metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
        },
        version,
      )
    }

    if (newest) {
      // Fetch limit+1 entries (the extra entry provides the baseline hash), windowed by
      // chain_seq DESC — the TRUE chain order assigned inside the locked emit RPC — NOT by
      // wall-clock timestamp. Windowing by timestamp could slice the window at a point where
      // a later-timestamped row chains onto an earlier-timestamped one (concurrent emits),
      // producing a spurious "broken chain" at the window edge. NULLS LAST keeps legacy
      // (null-seq) rows out of the newest window; they are excluded from the verifiable chain.
      const { data: descRows, error } = await this.db
        .from(AUDIT_TABLE)
        .select(SELECT_COLS)
        .order('chain_seq', { ascending: false, nullsFirst: false })
        .limit(limit + 1)

      if (error || !descRows) return { valid: false, checkedCount: 0, brokenAt: 'query_failed' }

      // Scope to rows written under the locked emit RPC (they carry a chain_seq and form
      // the verifiable hash chain); pre-migration/seeded rows (null chain_seq) are excluded.
      const rows = sortByChainOrderAsc(
        (descRows as unknown as Array<Record<string, unknown>>).filter((r) => r.chain_seq != null),
      )

      if (rows.length === 0) return { valid: true, checkedCount: 0 }

      // The oldest seq'd row in the window is the trusted anchor: it links onto rows outside
      // this scope (older seq'd rows beyond the limit, or the pre-seq legacy tip), so we
      // verify forward from it rather than recomputing its own hash.
      let prevHash = rows[0]!.chain_hash as string
      const startIdx = 1

      let checkedCount = 0
      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i]!
        const expected = expectedFor(prevHash, row)
        checkedCount++
        if (expected !== row.chain_hash) {
          return { valid: false, checkedCount, brokenAt: row.id as string }
        }
        prevHash = row.chain_hash as string
      }
      return { valid: true, checkedCount }
    }

    // Legacy: verify from the beginning (oldest first). Ordered by chain_seq ascending
    // (true chain order); null-seq rows sort first (they predate migration 045).
    const { data: ascRows, error } = await this.db
      .from(AUDIT_TABLE)
      .select(SELECT_COLS)
      .order('chain_seq', { ascending: true, nullsFirst: true })
      .order('timestamp', { ascending: true })
      .limit(limit)

    if (error || !ascRows) return { valid: false, checkedCount: 0, brokenAt: 'query_failed' }

    // Order by true chain position (chain_seq); fall back to the original ascending
    // timestamp order when no row carries a chain_seq (pre-migration data). See newest branch.
    const ascRowsTyped = ascRows as unknown as Array<Record<string, unknown>>
    const rows = ascRowsTyped.some((r) => r.chain_seq != null)
      ? sortByChainOrderAsc(ascRowsTyped)
      : ascRowsTyped

    let prevHash = GENESIS_HASH
    let checkedCount = 0
    for (const row of rows) {
      const expected = expectedFor(prevHash, row)
      checkedCount++
      if (expected !== row.chain_hash) {
        return { valid: false, checkedCount, brokenAt: row.id as string }
      }
      prevHash = row.chain_hash as string
    }
    return { valid: true, checkedCount }
  }
}
