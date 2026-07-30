import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash, randomUUID } from 'crypto'
import { UserRole, AuditAction, AuditResourceType, AuditOutcome } from '@ultranos/shared-types'

// ============================================================
// Hash Chain Concurrency Tests — Story 21.6
// Verifies:
// - Hash parity between JS computeChainHash() and PostgreSQL
// - Concurrent emit() serialization via RPC
// - Batch sync chain integrity
// - Error propagation from RPC failures
// ============================================================

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

function computeExpectedHash(prevHash: string, event: {
  id: string
  timestamp: string
  actorId?: string
  actorRole: string
  action: string
  resourceType: string
  resourceId?: string
  patientId?: string
  outcome: string
}) {
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

/**
 * Simulates the PostgreSQL audit_emit_with_lock function behavior:
 * - Serializes access to chain (sequential prevHash resolution)
 * - Returns chain_hash computed from the serialized state
 */
function createSerializedMockSupabase() {
  let currentChainHash = GENESIS_HASH
  const insertedRows: Array<Record<string, unknown>> = []

  return {
    mock: {
      rpc: vi.fn().mockImplementation(async (fn: string, params: Record<string, unknown>) => {
        // Simulate the advisory lock serialization: each call sees the latest chain_hash
        const prevHash = currentChainHash
        const chainHash = computeExpectedHash(prevHash, {
          id: params.p_id as string,
          timestamp: params.p_timestamp as string,
          actorId: (params.p_actor_id as string) ?? undefined,
          actorRole: params.p_actor_role as string,
          action: params.p_action as string,
          resourceType: params.p_resource_type as string,
          resourceId: (params.p_resource_id as string) ?? undefined,
          patientId: (params.p_patient_id as string) ?? undefined,
          outcome: params.p_outcome as string,
        })
        currentChainHash = chainHash
        // Emulate migration 045: the RPC assigns a monotonic chain_seq under the lock.
        const chainSeq = insertedRows.length + 1
        insertedRows.push({ ...params, chain_hash: chainHash, prev_hash: prevHash, chain_seq: chainSeq })
        return { data: [{ ...params, chain_hash: chainHash, chain_seq: chainSeq }], error: null }
      }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    },
    getInsertedRows: () => insertedRows,
    getCurrentChainHash: () => currentChainHash,
  }
}

// Dynamically import AuditLogger (ESM module)
const { AuditLogger } = await import('../../src/logger.js')

describe('Hash Chain Concurrency — Story 21.6', () => {
  describe('hash computation parity (JS ↔ PostgreSQL)', () => {
    it('produces identical hash for fully populated event', () => {
      const hash = computeExpectedHash(GENESIS_HASH, {
        id: 'a0000000-0000-0000-0000-000000000001',
        timestamp: '2024-01-01T00:00:00.000Z',
        actorId: 'a0000000-0000-0000-0000-000000000002',
        actorRole: 'DOCTOR',
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        resourceId: 'a0000000-0000-0000-0000-000000000003',
        patientId: 'a0000000-0000-0000-0000-000000000003',
        outcome: 'SUCCESS',
      })
      // This hash was verified against PostgreSQL:
      // encode(extensions.digest(json_strip_nulls(json_build_object(...))::text, 'sha256'), 'hex')
      expect(hash).toBe('33f87ec32cca9006c86c32744442403d7c51c44f1deb8b66bc2976280c812140')
    })

    it('produces identical hash with null/undefined optional fields', () => {
      const hash = computeExpectedHash(GENESIS_HASH, {
        id: 'test-id',
        timestamp: '2024-01-01T00:00:00.000Z',
        actorId: undefined,
        actorRole: 'DOCTOR',
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        resourceId: undefined,
        patientId: undefined,
        outcome: 'SUCCESS',
      })
      // Verified against PostgreSQL with NULL values + json_strip_nulls
      expect(hash).toBe('0fec0ba87e0a4a8765b09665461a1feeccd0e41932aa4cb6226b78276c7499b6')
    })

    it('verifyChain validates DB-shaped rows (null columns, +00:00 timestamps) against the PG-stored hash', async () => {
      // A single row exactly as Supabase RETURNS it after audit_emit_with_lock stored it:
      //  - optional columns come back as null (not undefined)
      //  - the timestamptz serialises as +00:00 (not the ...Z text that was hashed)
      //  - chain_hash is the PG value proven in the null-fields test above
      // The oldest seq'd row is the trusted anchor (its hash links onto out-of-scope rows);
      // verification walks forward from it, so we anchor with a GENESIS-hashed row and then
      // verify the DB-shaped null-column row chains onto it.
      const anchorRow = {
        id: 'anchor', timestamp: '2023-12-31T00:00:00.000+00:00', actor_id: null,
        actor_role: 'DOCTOR', action: 'PHI_READ', resource_type: 'PATIENT',
        resource_id: null, patient_id: null, outcome: 'SUCCESS',
        chain_hash: GENESIS_HASH, chain_seq: 1,
      }
      const dbRow = {
        id: 'test-id',
        timestamp: '2024-01-01T00:00:00.000+00:00',
        actor_id: null,
        actor_role: 'DOCTOR',
        action: 'PHI_READ',
        resource_type: 'PATIENT',
        resource_id: null,
        patient_id: null,
        outcome: 'SUCCESS',
        chain_hash: '0fec0ba87e0a4a8765b09665461a1feeccd0e41932aa4cb6226b78276c7499b6',
        chain_seq: 2,
      }
      const mock = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [anchorRow, dbRow], error: null }),
            }),
          }),
        }),
      }
      const result = await new AuditLogger(mock as any).verifyChain(100)
      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(1)
    })

    it('different prevHash produces different chain hash', () => {
      const event = {
        id: 'test-id',
        timestamp: '2024-01-01T00:00:00.000Z',
        actorId: 'user-001',
        actorRole: 'DOCTOR',
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        resourceId: 'patient-001',
        patientId: 'patient-001',
        outcome: 'SUCCESS',
      }
      const hash1 = computeExpectedHash(GENESIS_HASH, event)
      const hash2 = computeExpectedHash('aaaa' + GENESIS_HASH.slice(4), event)
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('concurrent emit() serialization', () => {
    it('10 concurrent emit() calls produce a valid sequential chain (no forks)', async () => {
      const { mock, getInsertedRows } = createSerializedMockSupabase()
      const logger = new AuditLogger(mock as any)

      // Fire 10 concurrent emit() calls
      const promises = Array.from({ length: 10 }, (_, i) =>
        logger.emit({
          actorId: 'user-001',
          actorRole: UserRole.DOCTOR,
          action: AuditAction.PHI_READ,
          resourceType: AuditResourceType.PATIENT,
          resourceId: `patient-${i}`,
          patientId: `patient-${i}`,
          outcome: AuditOutcome.SUCCESS,
        })
      )

      const results = await Promise.all(promises)

      // All 10 should succeed
      expect(results).toHaveLength(10)
      for (const r of results) {
        expect(r.chainHash).toMatch(/^[a-f0-9]{64}$/)
      }

      // Verify the chain is sequential (no forks)
      const rows = getInsertedRows()
      expect(rows).toHaveLength(10)

      // Each row's prev_hash should be unique (no two rows share the same parent)
      const prevHashes = rows.map(r => r.prev_hash as string)
      const uniquePrevHashes = new Set(prevHashes)
      expect(uniquePrevHashes.size).toBe(10)
    })

    it('chain can be verified after concurrent inserts', async () => {
      const { mock, getInsertedRows } = createSerializedMockSupabase()
      const logger = new AuditLogger(mock as any)

      // Insert 5 events concurrently
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          logger.emit({
            actorId: 'user-001',
            actorRole: UserRole.DOCTOR,
            action: AuditAction.PHI_READ,
            resourceType: AuditResourceType.PATIENT,
            resourceId: `patient-${i}`,
            patientId: `patient-${i}`,
            outcome: AuditOutcome.SUCCESS,
          })
        )
      )

      // Now set up verifyChain mock with the inserted rows
      const rows = getInsertedRows()
      const verifyMock = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: rows.map(r => ({
                  id: r.p_id,
                  timestamp: r.p_timestamp,
                  actor_id: r.p_actor_id,
                  actor_role: r.p_actor_role,
                  action: r.p_action,
                  resource_type: r.p_resource_type,
                  resource_id: r.p_resource_id,
                  patient_id: r.p_patient_id,
                  outcome: r.p_outcome,
                  chain_hash: r.chain_hash,
                  chain_seq: r.chain_seq,
                })),
                error: null,
              }),
            }),
          }),
        }),
      }

      const verifyLogger = new AuditLogger(verifyMock as any)
      const result = await verifyLogger.verifyChain(100)

      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(4)
      expect(result.brokenAt).toBeUndefined()
    })
  })

  describe('batch sync chain integrity', () => {
    it('sequential batch of 5 events maintains chain integrity', async () => {
      const { mock, getInsertedRows } = createSerializedMockSupabase()
      const logger = new AuditLogger(mock as any)

      // Process batch sequentially (as audit.sync does)
      for (let i = 0; i < 5; i++) {
        await logger.emit({
          actorId: 'user-001',
          actorRole: UserRole.DOCTOR,
          action: AuditAction.PHI_WRITE,
          resourceType: AuditResourceType.PATIENT,
          resourceId: `patient-${i}`,
          patientId: `patient-${i}`,
          outcome: AuditOutcome.SUCCESS,
          metadata: { source: 'client-audit-sync', clientEventId: `event-${i}` },
        })
      }

      const rows = getInsertedRows()
      expect(rows).toHaveLength(5)

      // Verify chain links: each row's prev_hash equals the previous row's chain_hash
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.prev_hash).toBe(rows[i - 1]!.chain_hash)
      }

      // First row should chain from genesis
      expect(rows[0]!.prev_hash).toBe(GENESIS_HASH)
    })
  })

  describe('chain_seq ordering (migration 045)', () => {
    // Build a valid chain r0->r1->r2 (from genesis) whose wall-clock timestamps are
    // INVERTED relative to chain order — simulating concurrent emit()s that stamped
    // their JS timestamp before the RPC's advisory lock serialized them.
    // Non-null patient/resource ids keep the hash unambiguous (null-strip parity is
    // out of scope here — this test isolates ordering).
    function buildInvertedChain() {
      const spec = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000001', ts: '2026-07-27T00:00:03.000Z', seq: 102 }, // chain pos 0, latest ts
        { id: 'bbbbbbbb-0000-0000-0000-000000000002', ts: '2026-07-27T00:00:02.000Z', seq: 103 }, // chain pos 1
        { id: 'cccccccc-0000-0000-0000-000000000003', ts: '2026-07-27T00:00:01.000Z', seq: 104 }, // chain pos 2, earliest ts
      ]
      let prev = GENESIS_HASH
      return spec.map((s) => {
        const chainHash = computeExpectedHash(prev, {
          id: s.id, timestamp: s.ts, actorId: 'user-001', actorRole: 'DOCTOR',
          action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'patient-001',
          patientId: 'patient-001', outcome: 'SUCCESS',
        })
        prev = chainHash
        return {
          id: s.id, timestamp: s.ts, actor_id: 'user-001', actor_role: 'DOCTOR',
          action: 'PHI_READ', resource_type: 'PATIENT', resource_id: 'patient-001',
          patient_id: 'patient-001', outcome: 'SUCCESS', chain_hash: chainHash, chain_seq: s.seq,
        }
      })
    }

    function verifyMockReturning(rows: Array<Record<string, unknown>>) {
      return {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        }),
      }
    }

    it('verifies a chain whose timestamps are out of order, using chain_seq', async () => {
      const rows = buildInvertedChain()
      const logger = new AuditLogger(verifyMockReturning(rows) as any)
      const result = await logger.verifyChain(1000)
      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(2)
      expect(result.brokenAt).toBeUndefined()
    })

    it('excludes rows without a chain_seq (legacy/seeded rows are not part of the verifiable chain)', async () => {
      // Rows written outside the locked emit RPC carry a null chain_seq. verifyChain scopes
      // to seq'd rows only, so a set of purely null-seq rows is an empty verifiable chain
      // (valid, nothing to verify) rather than walked in an unreliable timestamp order.
      const rows = buildInvertedChain().map(({ chain_seq: _omit, ...rest }) => rest)
      const logger = new AuditLogger(verifyMockReturning(rows) as any)
      const result = await logger.verifyChain(1000)
      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(0)
    })
  })

  describe('error propagation', () => {
    it('RPC failure throws compliance error with original message', async () => {
      const mockDb = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'advisory lock timeout', code: '55P03' },
        }),
      }
      const logger = new AuditLogger(mockDb as any)

      await expect(logger.emit({
        actorRole: UserRole.DOCTOR,
        action: AuditAction.PHI_READ,
        resourceType: AuditResourceType.PATIENT,
        outcome: AuditOutcome.SUCCESS,
      })).rejects.toThrow('[AuditLogger] Insert failed: advisory lock timeout')
    })

    it('RPC network error throws compliance error', async () => {
      const mockDb = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'FetchError: network timeout' },
        }),
      }
      const logger = new AuditLogger(mockDb as any)

      await expect(logger.emit({
        actorRole: UserRole.DOCTOR,
        action: AuditAction.PHI_READ,
        resourceType: AuditResourceType.PATIENT,
        outcome: AuditOutcome.SUCCESS,
      })).rejects.toThrow('[AuditLogger] Insert failed')
    })
  })
})
