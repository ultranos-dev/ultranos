import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash, randomUUID } from 'crypto'

// ============================================================
// health.auditChainIntegrity Tests — Story 8.2 (AC 4)
// Tests the chain integrity health check endpoint.
// ============================================================

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

function computeExpectedHash(prevHash: string, event: {
  id: string; timestamp: string; actorId?: string; actorRole: string
  action: string; resourceType: string; resourceId?: string
  patientId?: string; outcome: string
}) {
  const data = JSON.stringify({
    prevHash, id: event.id, timestamp: event.timestamp,
    actorId: event.actorId, actorRole: event.actorRole,
    action: event.action, resourceType: event.resourceType,
    resourceId: event.resourceId, patientId: event.patientId,
    outcome: event.outcome,
  })
  return createHash('sha256').update(data).digest('hex')
}

function buildChain(count: number) {
  const entries = []
  let prevHash = GENESIS_HASH
  for (let i = 0; i < count; i++) {
    const id = randomUUID()
    const timestamp = new Date(Date.now() + i * 1000).toISOString()
    const chainHash = computeExpectedHash(prevHash, {
      id, timestamp, actorId: 'user-001', actorRole: 'DOCTOR',
      action: 'PHI_READ', resourceType: 'PATIENT',
      resourceId: `patient-${i}`, patientId: `patient-${i}`, outcome: 'SUCCESS',
    })
    entries.push({
      id, timestamp, actor_id: 'user-001', actor_role: 'DOCTOR',
      action: 'PHI_READ', resource_type: 'PATIENT',
      resource_id: `patient-${i}`, patient_id: `patient-${i}`,
      outcome: 'SUCCESS', chain_hash: chainHash,
    })
    prevHash = chainHash
  }
  return entries
}

// Mock audit-logger to pass through to our mock DB
vi.mock('@ultranos/audit-logger', async () => {
  const actual = await vi.importActual('@ultranos/audit-logger')
  return actual
})

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

function createTestContext(
  user: { sub: string; role: string; sessionId: string } | null,
  chainEntries: Array<Record<string, unknown>> = [],
) {
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'audit_log') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: chainEntries.length > 0 ? { chain_hash: chainEntries[chainEntries.length - 1]!.chain_hash } : null,
                    error: chainEntries.length > 0 ? null : { code: 'PGRST116' },
                  }),
                  // For verifyChain — returns array
                  then: undefined,
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({ error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }),
    } as never,
    user,
    headers: new Headers(),
  }
}

describe('health.auditChainIntegrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns valid for an intact chain (ADMIN only)', async () => {
    const chain = buildChain(5)

    const ctx = {
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'audit_log') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: chain, error: null }),
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }),
      } as never,
      user: { sub: 'admin-001', role: 'ADMIN', sessionId: 'session-001' },
      headers: new Headers(),
    }

    const caller = createCaller(ctx)
    const result = await caller.health.auditChainIntegrity({ limit: 100 })

    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(5)
    expect(result.brokenAt).toBeUndefined()
  })

  it('rejects non-ADMIN users with FORBIDDEN', async () => {
    const ctx = {
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      } as never,
      user: { sub: 'doc-001', role: 'DOCTOR', sessionId: 'session-001' },
      headers: new Headers(),
    }

    const caller = createCaller(ctx)

    await expect(caller.health.auditChainIntegrity()).rejects.toThrow()
  })

  it('rejects unauthenticated users', async () => {
    const ctx = {
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as never,
      user: null,
      headers: new Headers(),
    }

    const caller = createCaller(ctx)

    await expect(caller.health.auditChainIntegrity()).rejects.toThrow()
  })

  it('detects a tampered chain and returns brokenAt', async () => {
    const chain = buildChain(3)
    // Tamper with the second entry
    chain[1]!.action = 'CREATE'

    const ctx = {
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'audit_log') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: chain, error: null }),
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }),
      } as never,
      user: { sub: 'admin-001', role: 'ADMIN', sessionId: 'session-001' },
      headers: new Headers(),
    }

    const caller = createCaller(ctx)
    const result = await caller.health.auditChainIntegrity()

    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(chain[1]!.id)
    expect(result.checkedCount).toBe(2)
  })
})
