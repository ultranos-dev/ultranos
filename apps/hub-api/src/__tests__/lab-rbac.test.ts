import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock Supabase client with configurable responses
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRestrictedProcedure } = await import('../trpc/rbac')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

describe('labRestrictedProcedure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows LAB_TECH with valid lab affiliation and enriches context', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'tech-1',
        lab_id: 'lab-1',
        labs: { id: 'lab-1', status: 'ACTIVE' },
      },
      error: null,
    })

    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(({ ctx }) => {
        return { lab: (ctx as any).lab }
      }),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.labEndpoint()
    expect(result.lab).toEqual({
      technicianId: 'tech-1',
      labId: 'lab-1',
      labStatus: 'ACTIVE',
    })
  })

  it('denies access for non-LAB_TECH roles', async () => {
    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'DOCTOR', sessionId: 's1' }),
    )
    await expect(caller.labEndpoint()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('denies access when user is null (UNAUTHORIZED)', async () => {
    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(makeCtx(null))
    await expect(caller.labEndpoint()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('denies access when technician has no lab affiliation', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.labEndpoint()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('ADMIN bypasses LAB_TECH restriction without lab context', async () => {
    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(({ ctx }) => {
        return { hasLab: 'lab' in ctx }
      }),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.labEndpoint()
    expect(result.hasLab).toBe(false)
  })

  it('includes lab status in context for PENDING labs', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'tech-2',
        lab_id: 'lab-2',
        labs: { id: 'lab-2', status: 'PENDING' },
      },
      error: null,
    })

    const router = createTRPCRouter({
      labEndpoint: labRestrictedProcedure.query(({ ctx }) => {
        return { lab: (ctx as any).lab }
      }),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u2', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.labEndpoint()
    expect(result.lab.labStatus).toBe('PENDING')
  })
})
