import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Configurable mock chain for Supabase operations
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))

// Mock delete chain for compensating cleanup
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }))

// Track which table each .from() targets
let fromCalls: string[] = []
const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  return { insert: mockInsert, select: vi.fn(), delete: mockDelete }
})

// Mock audit logger
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

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

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

const validInput = {
  labName: 'Central Pathology Lab',
  licenseRef: 'LIC-2024-001',
  accreditationRef: 'ISO-15189-2024',
  technicianCredentialRef: 'TECH-CERT-001',
}

describe('lab.register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls = []
  })

  it('registers a lab with PENDING status and binds technician', async () => {
    // First call: insert lab → success
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'lab-uuid-1' },
      error: null,
    })
    // Second call: insert lab_technician → success (no .select().single())
    mockInsert.mockReturnValueOnce({
      select: mockInsertSelect,
    }).mockReturnValueOnce({
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    const result = await caller.lab.register(validInput)
    expect(result.success).toBe(true)
    expect(result.labId).toBe('lab-uuid-1')
    expect(result.status).toBe('PENDING')
  })

  it('rejects unauthenticated requests', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx(null))

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('emits an audit event with Organization resourceType on successful registration', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'lab-uuid-2' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({
      select: mockInsertSelect,
    }).mockReturnValueOnce({
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    await caller.lab.register(validInput)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'Organization',
        actorId: 'tech-1',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('returns CONFLICT if technician is already registered to a lab', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'lab-uuid-3' },
      error: null,
    })
    // lab_technicians insert fails with unique constraint violation
    mockInsert.mockReturnValueOnce({
      select: mockInsertSelect,
    }).mockReturnValueOnce({
      error: { code: '23505', message: 'duplicate key' },
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    })

    // Verify compensating delete was called to clean up orphaned lab
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'lab-uuid-3')
  })

  it('validates required input fields', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    // Missing labName
    await expect(
      caller.lab.register({ ...validInput, labName: '' }),
    ).rejects.toThrow()

    // Missing licenseRef
    await expect(
      caller.lab.register({ ...validInput, licenseRef: '' }),
    ).rejects.toThrow()
  })

  it('returns INTERNAL_SERVER_ERROR when lab insert fails', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    await expect(caller.lab.register(validInput)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('allows registration without optional accreditationRef', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: { id: 'lab-uuid-4' },
      error: null,
    })
    mockInsert.mockReturnValueOnce({
      select: mockInsertSelect,
    }).mockReturnValueOnce({
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'tech-1', role: 'LAB_TECH', sessionId: 's1' }),
    )

    const { accreditationRef: _, ...inputWithoutAccreditation } = validInput
    const result = await caller.lab.register(inputWithoutAccreditation)
    expect(result.success).toBe(true)
  })
})
