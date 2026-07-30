import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash, randomUUID } from 'crypto'

// ============================================================
// AuditLogger Unit Tests — Story 8.2 + 21.6
// Tests RPC-based emit(), hash chaining, chain verification,
// concurrent writes, and tamper detection.
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

// Track RPC calls for verification
let rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

function createMockSupabase(overrides?: {
  rpcError?: { message: string; code?: string } | null
  selectRows?: Array<Record<string, unknown>>
  selectError?: { message: string; code?: string } | null
}) {
  return {
    rpc: vi.fn().mockImplementation((fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      if (overrides?.rpcError) {
        return Promise.resolve({ data: null, error: overrides.rpcError })
      }
      const chainHash = computeExpectedHash(GENESIS_HASH, {
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
      return Promise.resolve({
        data: [{ ...params, chain_hash: chainHash }],
        error: null,
      })
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: overrides?.selectRows ?? [],
            error: overrides?.selectError ?? null,
          }),
        }),
      }),
    }),
  }
}

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
    rpcCalls = []
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
    it('calls audit_emit_with_lock RPC and returns a record with valid SHA-256 chain hash', async () => {
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      const result = await logger.emit(baseInput)

      expect(rpcCalls).toHaveLength(1)
      expect(rpcCalls[0]!.fn).toBe('audit_emit_with_lock')
      expect(result.chainHash).toMatch(/^[a-f0-9]{64}$/)
      expect(result.id).toBeDefined()
      expect(result.timestamp).toBeDefined()
    })

    it('throws when RPC fails (compliance failure)', async () => {
      const mockDb = createMockSupabase({
        rpcError: { message: 'connection refused', code: 'ECONNREFUSED' },
      })
      const logger = new AuditLogger(mockDb as any)

      await expect(logger.emit(baseInput)).rejects.toThrow('[AuditLogger] Insert failed')
    })

    it('passes correct RPC parameters with snake_case mapping', async () => {
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      const result = await logger.emit({
        ...baseInput,
        deviceId: 'device-001',
        sourceIpHash: 'ip-hash-001',
        denialReason: undefined,
        metadata: { foo: 'bar' },
      })

      expect(rpcCalls).toHaveLength(1)
      const params = rpcCalls[0]!.params
      expect(params.p_id).toBe(result.id)
      expect(params.p_timestamp).toBe(result.timestamp)
      expect(params.p_actor_id).toBe('user-001')
      expect(params.p_actor_role).toBe('DOCTOR')
      expect(params.p_action).toBe('PHI_READ')
      expect(params.p_resource_type).toBe('PATIENT')
      expect(params.p_resource_id).toBe('patient-001')
      expect(params.p_patient_id).toBe('patient-001')
      expect(params.p_device_id).toBe('device-001')
      expect(params.p_source_ip_hash).toBe('ip-hash-001')
      expect(params.p_denial_reason).toBeNull()
      expect(params.p_metadata).toEqual({ foo: 'bar' })
    })

    it('passes null for optional undefined fields', async () => {
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      await logger.emit({
        actorRole: 'DOCTOR' as const,
        action: 'PHI_READ' as const,
        resourceType: 'PATIENT' as const,
        outcome: 'SUCCESS' as const,
      })

      const params = rpcCalls[0]!.params
      expect(params.p_actor_id).toBeNull()
      expect(params.p_resource_id).toBeNull()
      expect(params.p_patient_id).toBeNull()
      expect(params.p_session_id).toBeNull()
      expect(params.p_device_id).toBeNull()
      expect(params.p_source_ip_hash).toBeNull()
      expect(params.p_denial_reason).toBeNull()
      expect(params.p_metadata).toBeNull()
    })
  })

  describe('verifyChain()', () => {
    it('returns valid for an intact chain', async () => {
      const entries = []
      let prevHash = GENESIS_HASH

      for (let i = 0; i < 3; i++) {
        const id = randomUUID()
        const timestamp = new Date(Date.now() + i * 1000).toISOString()
        const chainHash = computeExpectedHash(prevHash, {
          id, timestamp,
          actorId: 'user-001', actorRole: 'DOCTOR',
          action: 'PHI_READ', resourceType: 'PATIENT',
          resourceId: `patient-${i}`, patientId: `patient-${i}`,
          outcome: 'SUCCESS',
        })
        entries.push({
          id, timestamp,
          actor_id: 'user-001', actor_role: 'DOCTOR',
          action: 'PHI_READ', resource_type: 'PATIENT',
          resource_id: `patient-${i}`, patient_id: `patient-${i}`,
          outcome: 'SUCCESS', chain_hash: chainHash,
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
      const result = await logger.verifyChain(100, { newest: false })

      expect(result.valid).toBe(true)
      expect(result.checkedCount).toBe(3)
      expect(result.brokenAt).toBeUndefined()
    })

    it('returns invalid with brokenAt when a record is tampered', async () => {
      const entries = []
      let prevHash = GENESIS_HASH

      for (let i = 0; i < 3; i++) {
        const id = randomUUID()
        const timestamp = new Date(Date.now() + i * 1000).toISOString()
        const chainHash = computeExpectedHash(prevHash, {
          id, timestamp,
          actorId: 'user-001', actorRole: 'DOCTOR',
          action: 'PHI_READ', resourceType: 'PATIENT',
          resourceId: `patient-${i}`, patientId: `patient-${i}`,
          outcome: 'SUCCESS',
        })
        entries.push({
          id, timestamp,
          actor_id: 'user-001', actor_role: 'DOCTOR',
          action: 'PHI_READ', resource_type: 'PATIENT',
          resource_id: `patient-${i}`, patient_id: `patient-${i}`,
          outcome: 'SUCCESS', chain_hash: chainHash,
        })
        prevHash = chainHash
      }

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
      const result = await logger.verifyChain(100, { newest: false })

      expect(result.valid).toBe(false)
      expect(result.checkedCount).toBe(2)
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
      const correctHash = computeExpectedHash(GENESIS_HASH, {
        id, timestamp,
        actorId: 'user-001', actorRole: 'DOCTOR',
        action: 'PHI_READ', resourceType: 'PATIENT',
        resourceId: 'patient-0', patientId: 'patient-0',
        outcome: 'SUCCESS',
      })

      const entries = [{
        id, timestamp,
        actor_id: 'user-001', actor_role: 'DOCTOR',
        action: 'PHI_READ', resource_type: 'PATIENT',
        resource_id: 'patient-0', patient_id: 'patient-0',
        outcome: 'SUCCESS',
        chain_hash: correctHash[0] === 'a' ? 'b' + correctHash.slice(1) : 'a' + correctHash.slice(1),
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
      // Genesis-break detection requires verifying the first record against GENESIS. The
      // default (newest) path is a rolling window that trusts its oldest in-scope row as an
      // anchor, so full-from-genesis verification is the legacy (newest: false) path.
      const result = await logger.verifyChain(100, { newest: false })

      expect(result.valid).toBe(false)
      expect(result.checkedCount).toBe(1)
      expect(result.brokenAt).toBe(id)
    })
  })

  describe('concurrent emit() calls', () => {
    it('all produce valid records via RPC (serialization handled by DB advisory lock)', async () => {
      const mockDb = createMockSupabase()
      const logger = new AuditLogger(mockDb as any)

      const results = await Promise.all([
        logger.emit({ ...baseInput, resourceId: 'p1' }),
        logger.emit({ ...baseInput, resourceId: 'p2' }),
        logger.emit({ ...baseInput, resourceId: 'p3' }),
      ])

      expect(results).toHaveLength(3)
      for (const r of results) {
        expect(r.chainHash).toMatch(/^[a-f0-9]{64}$/)
        expect(r.id).toBeDefined()
        expect(r.timestamp).toBeDefined()
      }

      expect(rpcCalls).toHaveLength(3)
      for (const call of rpcCalls) {
        expect(call.fn).toBe('audit_emit_with_lock')
      }
    })
  })
})
