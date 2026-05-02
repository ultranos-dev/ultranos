import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash, randomUUID } from 'crypto'

// ============================================================
// Audit Integration Tests — Story 8.2 (AC 2, 8)
// Verifies that Hub API routers emit audit events and that
// chain integrity detection works end-to-end.
// ============================================================

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

// Track all audit.emit() calls across routers
const auditEmitCalls: Array<Record<string, unknown>> = []
let emitShouldFail = false

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
      if (emitShouldFail) throw new Error('DB unavailable')
      auditEmitCalls.push(input)
      return { id: randomUUID(), timestamp: new Date().toISOString(), chainHash: 'mock-hash', ...input }
    }),
    verifyChain: vi.fn(),
  })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn().mockReturnValue('hashed-id'),
  encryptField: vi.fn().mockReturnValue('encrypted-content'),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn().mockReturnValue({
    encryptionKey: 'test-enc-key',
    hmacKey: 'test-hmac-key',
  }),
}))

vi.mock('@/lib/virus-scanner', () => ({
  scanFile: vi.fn().mockResolvedValue({ status: 'clean', hash: 'file-hash-abc' }),
}))

vi.mock('@/services/ocr', () => ({
  analyzeFile: vi.fn().mockResolvedValue({
    suggestions: [],
    processingTimeMs: 100,
    available: true,
    provider: 'mock',
  }),
}))

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

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function makeAuthCtx(role = 'DOCTOR') {
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'patients') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{
                      id: 'patient-001',
                      name: [{ given: ['Test'], family: 'Patient' }],
                      gender: 'male',
                      birth_date: '1990-01-01',
                      birth_year_only: false,
                      identifier: [],
                      meta_last_updated: new Date().toISOString(),
                      meta_version_id: '1',
                      ultranos_name_local: 'Test',
                      ultranos_name_latin: 'Test',
                      ultranos_name_phonetic: 'test',
                      ultranos_national_id_hash: 'hashed-id',
                      ultranos_is_active: true,
                      ultranos_created_at: new Date().toISOString(),
                    }],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'medication_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: '00000000-0000-0000-0000-000000000001',
                    prescription_status: 'ACTIVE',
                    status: 'active',
                    medication_display: 'Amoxicillin 500mg',
                    authored_on: '2026-01-01',
                    dispensed_at: null,
                    interaction_check: 'PASSED',
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: '00000000-0000-0000-0000-000000000001',
                        prescription_status: 'DISPENSED',
                        status: 'completed',
                        dispensed_at: new Date().toISOString(),
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }),
    } as never,
    user: { sub: 'user-001', role, sessionId: 'session-001' },
    headers: new Headers(),
  }
}

describe('Audit Integration — Router Emissions', () => {
  beforeEach(() => {
    auditEmitCalls.length = 0
    emitShouldFail = false
    vi.clearAllMocks()
  })

  describe('patient.search', () => {
    it('emits a PHI_READ audit event', async () => {
      const ctx = makeAuthCtx('DOCTOR')
      const caller = createCaller(ctx)

      await caller.patient.search({ query: 'Test' })

      const phiReadEvents = auditEmitCalls.filter(e => e.action === 'PHI_READ' && e.resourceType === 'PATIENT')
      expect(phiReadEvents).toHaveLength(1)
      expect(phiReadEvents[0]).toMatchObject({
        action: 'PHI_READ',
        resourceType: 'PATIENT',
        actorId: 'user-001',
        actorRole: 'DOCTOR',
        outcome: 'SUCCESS',
      })
    })

    it('proceeds when audit emission fails (non-blocking for clinical operation)', async () => {
      emitShouldFail = true
      const ctx = makeAuthCtx('DOCTOR')
      const caller = createCaller(ctx)

      // Should NOT throw even though audit fails
      const result = await caller.patient.search({ query: 'Test' })
      expect(result.patients).toBeDefined()
    })
  })

  describe('medication.getStatus', () => {
    it('emits a PHI_READ audit event', async () => {
      const ctx = makeAuthCtx('PHARMACIST')
      const caller = createCaller(ctx)

      await caller.medication.getStatus({ prescriptionId: '00000000-0000-0000-0000-000000000001' })

      const phiReadEvents = auditEmitCalls.filter(e => e.action === 'PHI_READ' && e.resourceType === 'PRESCRIPTION')
      expect(phiReadEvents).toHaveLength(1)
      expect(phiReadEvents[0]).toMatchObject({
        action: 'PHI_READ',
        resourceType: 'PRESCRIPTION',
        resourceId: '00000000-0000-0000-0000-000000000001',
        actorId: 'user-001',
        outcome: 'SUCCESS',
      })
    })
  })

  describe('medication.complete', () => {
    it('emits a PHI_WRITE audit event', async () => {
      const ctx = makeAuthCtx('PHARMACIST')
      const caller = createCaller(ctx)

      await caller.medication.complete({ prescriptionId: '00000000-0000-0000-0000-000000000001' })

      const phiWriteEvents = auditEmitCalls.filter(e => e.action === 'PHI_WRITE' && e.resourceType === 'PRESCRIPTION')
      expect(phiWriteEvents).toHaveLength(1)
      expect(phiWriteEvents[0]).toMatchObject({
        action: 'PHI_WRITE',
        resourceType: 'PRESCRIPTION',
        resourceId: '00000000-0000-0000-0000-000000000001',
        actorId: 'user-001',
        outcome: 'SUCCESS',
      })
    })
  })
})

describe('Audit Integration — Chain Verification', () => {
  beforeEach(() => {
    auditEmitCalls.length = 0
    vi.clearAllMocks()
  })

  it('chain integrity check returns valid for a sequence of operations', async () => {
    // Build a valid chain
    const chain: Array<Record<string, unknown>> = []
    let prevHash = GENESIS_HASH
    for (let i = 0; i < 3; i++) {
      const id = randomUUID()
      const timestamp = new Date(Date.now() + i * 1000).toISOString()
      const data = JSON.stringify({
        prevHash, id, timestamp,
        actorId: 'user-001', actorRole: 'DOCTOR',
        action: 'PHI_READ', resourceType: 'PATIENT',
        resourceId: `p-${i}`, patientId: `p-${i}`, outcome: 'SUCCESS',
      })
      const chainHash = createHash('sha256').update(data).digest('hex')
      chain.push({
        id, timestamp, actor_id: 'user-001', actor_role: 'DOCTOR',
        action: 'PHI_READ', resource_type: 'PATIENT',
        resource_id: `p-${i}`, patient_id: `p-${i}`,
        outcome: 'SUCCESS', chain_hash: chainHash,
      })
      prevHash = chainHash
    }

    // Use real AuditLogger for chain verification
    const { AuditLogger: RealAuditLogger } = await vi.importActual<typeof import('@ultranos/audit-logger')>('@ultranos/audit-logger')
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: chain, error: null }),
          }),
        }),
      }),
    }
    const logger = new RealAuditLogger(mockDb as any)
    const result = await logger.verifyChain(100)

    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(3)
  })

  it('tampered audit_log row is detected by chain verification', async () => {
    // Build a valid chain then tamper
    const chain: Array<Record<string, unknown>> = []
    let prevHash = GENESIS_HASH
    for (let i = 0; i < 3; i++) {
      const id = randomUUID()
      const timestamp = new Date(Date.now() + i * 1000).toISOString()
      const data = JSON.stringify({
        prevHash, id, timestamp,
        actorId: 'user-001', actorRole: 'DOCTOR',
        action: 'PHI_READ', resourceType: 'PATIENT',
        resourceId: `p-${i}`, patientId: `p-${i}`, outcome: 'SUCCESS',
      })
      const chainHash = createHash('sha256').update(data).digest('hex')
      chain.push({
        id, timestamp, actor_id: 'user-001', actor_role: 'DOCTOR',
        action: 'PHI_READ', resource_type: 'PATIENT',
        resource_id: `p-${i}`, patient_id: `p-${i}`,
        outcome: 'SUCCESS', chain_hash: chainHash,
      })
      prevHash = chainHash
    }

    // Tamper: change the outcome of the second record
    chain[1]!.outcome = 'FAILURE'

    const { AuditLogger: RealAuditLogger } = await vi.importActual<typeof import('@ultranos/audit-logger')>('@ultranos/audit-logger')
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: chain, error: null }),
          }),
        }),
      }),
    }
    const logger = new RealAuditLogger(mockDb as any)
    const result = await logger.verifyChain(100)

    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(chain[1]!.id)
    expect(result.checkedCount).toBe(2)
  })
})
