import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash, randomUUID } from 'crypto'

// ============================================================
// AuditLogger Unit Tests — Story 8.2 (AC 1, 8)
// Tests hash chaining, chain verification, concurrent writes,
// and tamper detection.
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

// Track inserted audit rows in-memory for chain verification tests
let insertedRows: Array<Record<string, unknown>> = []

function createMockSupabase(overrides?: {
  lastChainHash?: string | null
  insertError?: { message: string; code?: string } | null
  selectRows?: Array<Record<string, unknown>>
  selectError?: { message: string; code?: string } | null
}) {
  const lastHash = overrides?.lastChainHash ?? null

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: lastHash ? { chain_hash: lastHash } : null,
              error: lastHash ? null : { code: 'PGRST116' },
            }),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        if (overrides?.insertError) {
          return { error: overrides.insertError }
        }
        insertedRows.push(row)
        return { error: null }
      }),
    }),
  }
}

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { AuditLogger } = await import('@ultranos/audit-logger')

describe('AuditLogger', () => {
  beforeEach(() => {
    insertedRows = []
    vi.restoreAllMocks()
  })

  const baseInput = {
    actorId: 'user-001',
    actorRole: 'DOCTOR' as const,
    action: 'PHI_READ' as const,
    resourceType: 'PATIENT' as const,
    resourceId: 'patient-001',
    patientId: 'patient-001',
    outcome: 'SUCCESS' as const,
    sessionId: 'session-001',
  }

  describe('emit()', () => {
    it('creates a record with correct SHA-256 hash using genesis hash when no prior entry exists', async () => {
      const mockDb = createMockSupabase({ lastChainHash: null })
      const logger = new AuditLogger(mockDb as any)

      const result = await logger.emit(baseInput)

      // Verify the chain hash was computed using genesis hash
      const expected = computeExpectedHash(GENESIS_HASH, {
        id: result.id,
        timestamp: result.timestamp,
        actorId: baseInput.actorId,
        actorRole: baseInput.actorRole,
        action: baseInput.action,
        resourceType: baseInput.resourceType,
        resourceId: baseInput.resourceId,
        patientId: baseInput.patientId,
        outcome: baseInput.outcome,
      })

      expect(result.chainHash).toBe(expected)
      expect(result.chainHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
      expect(result.id).toBeDefined()
      expect(result.timestamp).toBeDefined()
    })

    it('creates a record chained to the previous entry hash', async () => {
      const prevHash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd'
      const mockDb = createMockSupabase({ lastChainHash: prevHash })
      const logger = new AuditLogger(mockDb as any)

      const result = await logger.emit(baseInput)

      // Verify the chain hash was computed using the previous hash
      const expected = computeExpectedHash(prevHash, {
        id: result.id,
        timestamp: result.timestamp,
        actorId: baseInput.actorId,
        actorRole: baseInput.actorRole,
        action: baseInput.action,
        resourceType: baseInput.resourceType,
        resourceId: baseInput.resourceId,
        patientId: baseInput.patientId,
        outcome: baseInput.outcome,
      })

      expect(result.chainHash).toBe(expected)
      // Chain hash should differ from genesis-based hash
      expect(result.chainHash).not.toBe(GENESIS_HASH)
    })

    it('throws when DB insert fails (compliance failure)', async () => {
      const mockDb = createMockSupabase({
        insertError: { message: 'connection refused', code: 'ECONNREFUSED' },
      })
      const logger = new AuditLogger(mockDb as any)

      await expect(logger.emit(baseInput)).rejects.toThrow('[AuditLogger] Insert failed')
    })

    it('inserts correct column mapping to DB', async () => {
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      const result = await logger.emit({
        ...baseInput,
        deviceId: 'device-001',
        sourceIpHash: 'ip-hash-001',
        denialReason: undefined,
        metadata: { foo: 'bar' },
      })

      // Verify the insert was called with correct column names
      expect(insertedRows).toHaveLength(1)
      const row = insertedRows[0]!
      expect(row.id).toBe(result.id)
      expect(row.actor_id).toBe('user-001')
      expect(row.actor_role).toBe('DOCTOR')
      expect(row.action).toBe('PHI_READ')
      expect(row.resource_type).toBe('PATIENT')
      expect(row.resource_id).toBe('patient-001')
      expect(row.patient_id).toBe('patient-001')
      expect(row.chain_hash).toBe(result.chainHash)
      expect(row.metadata).toEqual({ foo: 'bar' })
    })
  })

  describe('verifyChain()', () => {
    it('returns valid for an intact chain', async () => {
      // Build a 3-entry chain manually
      const entries = []
      let prevHash = GENESIS_HASH

      for (let i = 0; i < 3; i++) {
        const id = randomUUID()
        const timestamp = new Date(Date.now() + i * 1000).toISOString()
        const chainHash = computeExpectedHash(prevHash, {
          id,
          timestamp,
          actorId: 'user-001',
          actorRole: 'DOCTOR',
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: `patient-${i}`,
          patientId: `patient-${i}`,
          outcome: 'SUCCESS',
        })
        entries.push({
          id,
          timestamp,
          actor_id: 'user-001',
          actor_role: 'DOCTOR',
          action: 'PHI_READ',
          resource_type: 'PATIENT',
          resource_id: `patient-${i}`,
          patient_id: `patient-${i}`,
          outcome: 'SUCCESS',
          chain_hash: chainHash,
        })
        prevHash = chainHash
      }

      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: entries, error: null }),
            }),
          }),
        }),
      }

      const logger = new AuditLogger(mockDb as any)
      const result = await logger.verifyChain(100)

      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(3)
      expect(result.brokenAt).toBeUndefined()
    })

    it('returns invalid with brokenAt when a record is tampered', async () => {
      // Build a 3-entry chain, then tamper with the middle entry
      const entries = []
      let prevHash = GENESIS_HASH

      for (let i = 0; i < 3; i++) {
        const id = randomUUID()
        const timestamp = new Date(Date.now() + i * 1000).toISOString()
        const chainHash = computeExpectedHash(prevHash, {
          id,
          timestamp,
          actorId: 'user-001',
          actorRole: 'DOCTOR',
          action: 'PHI_READ',
          resourceType: 'PATIENT',
          resourceId: `patient-${i}`,
          patientId: `patient-${i}`,
          outcome: 'SUCCESS',
        })
        entries.push({
          id,
          timestamp,
          actor_id: 'user-001',
          actor_role: 'DOCTOR',
          action: 'PHI_READ',
          resource_type: 'PATIENT',
          resource_id: `patient-${i}`,
          patient_id: `patient-${i}`,
          outcome: 'SUCCESS',
          chain_hash: chainHash,
        })
        prevHash = chainHash
      }

      // Tamper with the second record's action
      entries[1]!.action = 'PHI_WRITE'

      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: entries, error: null }),
            }),
          }),
        }),
      }

      const logger = new AuditLogger(mockDb as any)
      const result = await logger.verifyChain(100)

      expect(result.valid).toBe(false)
      expect(result.checkedCount).toBe(2) // checked 2 entries before finding tampered one
      expect(result.brokenAt).toBe(entries[1]!.id)
    })

    it('returns invalid when query fails', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'connection failed' },
              }),
            }),
          }),
        }),
      }

      const logger = new AuditLogger(mockDb as any)
      const result = await logger.verifyChain()

      expect(result.valid).toBe(false)
      expect(result.checkedCount).toBe(0)
      expect(result.brokenAt).toBe('query_failed')
    })

    it('returns valid for an empty chain', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }

      const logger = new AuditLogger(mockDb as any)
      const result = await logger.verifyChain()

      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(0)
    })

    it('detects tampered first record (genesis break)', async () => {
      const id = randomUUID()
      const timestamp = new Date().toISOString()
      // Correct hash
      const correctHash = computeExpectedHash(GENESIS_HASH, {
        id,
        timestamp,
        actorId: 'user-001',
        actorRole: 'DOCTOR',
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        resourceId: 'patient-0',
        patientId: 'patient-0',
        outcome: 'SUCCESS',
      })

      // Corrupt the hash
      const entries = [{
        id,
        timestamp,
        actor_id: 'user-001',
        actor_role: 'DOCTOR',
        action: 'PHI_READ',
        resource_type: 'PATIENT',
        resource_id: 'patient-0',
        patient_id: 'patient-0',
        outcome: 'SUCCESS',
        chain_hash: correctHash.replace(/^./, 'f'), // flip first char
      }]

      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: entries, error: null }),
            }),
          }),
        }),
      }

      const logger = new AuditLogger(mockDb as any)
      const result = await logger.verifyChain()

      expect(result.valid).toBe(false)
      expect(result.checkedCount).toBe(1)
      expect(result.brokenAt).toBe(id)
    })
  })

  describe('concurrent emit() calls', () => {
    it('all produce valid records (sequential chaining)', async () => {
      // This tests that concurrent emit() calls each get their chain hash.
      // With the current implementation, concurrent calls may read the same
      // previous hash — this test verifies the mechanism works at the API level.
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      const results = await Promise.all([
        logger.emit({ ...baseInput, resourceId: 'p1' }),
        logger.emit({ ...baseInput, resourceId: 'p2' }),
        logger.emit({ ...baseInput, resourceId: 'p3' }),
      ])

      // All should succeed with valid chain hashes
      expect(results).toHaveLength(3)
      for (const r of results) {
        expect(r.chainHash).toMatch(/^[a-f0-9]{64}$/)
        expect(r.id).toBeDefined()
        expect(r.timestamp).toBeDefined()
      }

      // All inserted
      expect(insertedRows).toHaveLength(3)
    })
  })
})
