import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabRole, LabPermission } from '@ultranos/shared-types'

// ── Mock Supabase ────────────────────────────────────────────
const mockInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn() })) }))
const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) }))
const mockDelete = vi.fn(() => ({ eq: vi.fn() }))
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

// Audit mock
const mockAuditEmit = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((v: string) => `hash_${v}`),
  encryptField: vi.fn((v: string) => `enc_${v}`),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'test-key', hmacKey: 'test-hmac' })),
}))

vi.mock('@/lib/virus-scanner', () => ({
  scanFile: vi.fn().mockResolvedValue({ status: 'clean', hash: 'abc123' }),
}))

vi.mock('@/services/ocr', () => ({
  analyzeFile: vi.fn(),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRestrictedProcedure } = await import('../trpc/rbac')
const { enforceLabRole } = await import('../trpc/middleware/enforceLabRole')

function makeCtx(user: { sub: string; role: string; sessionId: string }) {
  return {
    supabase: {
      from: mockFrom,
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: 'auth-1', email: 'tech@lab.test' }] },
          }),
        },
      },
    } as never,
    user,
    headers: new Headers(),
  }
}

/**
 * Setup Supabase mock to return lab tech with given role for labRestrictedProcedure.
 */
function setupLabContext(labRole: string) {
  // labRestrictedProcedure calls: from('lab_technicians').select(...).eq(...).single()
  // getMyRole calls: from('lab_technicians').select(...).eq(...).maybeSingle()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'lab_technicians') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, _val: string) => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'tech-1',
                lab_id: 'lab-1',
                lab_role: labRole,
                practitioner_id: 'prac-1',
                created_at: '2026-01-01T00:00:00Z',
                labs: { id: 'lab-1', status: 'ACTIVE' },
              },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                lab_role: labRole,
                labs: { status: 'ACTIVE' },
              },
              error: null,
            }),
            eq: vi.fn().mockImplementation(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'tech-target',
                  practitioner_id: 'prac-target',
                  lab_role: LabRole.LAB_TECH,
                },
                error: null,
              }),
            })),
          })),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'prac-1', auth_user_id: 'auth-1' }],
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'practitioners') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'prac-1', auth_user_id: 'auth-1' }],
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
  })
}

describe('lab.getMyRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the caller lab role from context', async () => {
    setupLabContext('SUPERVISOR')

    // Dynamically import the router to use our mocks
    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'prac-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.getMyRole()
    expect(result.labRole).toBe('SUPERVISOR')
  })

  it('returns null labRole for ADMIN users (no lab context)', async () => {
    // Override mockFrom so maybeSingle() returns null (no lab_technician row for admin user)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    })

    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.getMyRole()
    expect(result.labRole).toBeNull()
  })
})

describe('lab.listStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forbidden for LAB_TECH role', async () => {
    setupLabContext('LAB_TECH')
    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'prac-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.listStaff()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('allowed for SUPERVISOR role', async () => {
    setupLabContext('SUPERVISOR')
    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'prac-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    // Should not throw FORBIDDEN (may fail on supabase mock but not FORBIDDEN)
    const result = await caller.listStaff().catch((e: any) => {
      // Only re-throw if it's a FORBIDDEN error
      if (e.code === 'FORBIDDEN') throw e
      return [] // mock data response
    })
    expect(result).toBeDefined()
  })
})

describe('lab.updateStaffRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forbidden for SUPERVISOR role (requires LAB_MANAGER)', async () => {
    setupLabContext('SUPERVISOR')
    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'prac-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(
      caller.updateStaffRole({
        targetPractitionerId: 'prac-target',
        newRole: LabRole.SENIOR_TECH,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('forbidden for LAB_TECH role', async () => {
    setupLabContext('LAB_TECH')
    const { labRouter } = await import('../trpc/routers/lab')
    const caller = createCallerFactory(labRouter)(
      makeCtx({ sub: 'prac-1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(
      caller.updateStaffRole({
        targetPractitionerId: 'prac-target',
        newRole: LabRole.SENIOR_TECH,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
