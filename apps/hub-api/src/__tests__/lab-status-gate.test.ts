import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// Mock Supabase
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

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
const { labRestrictedProcedure } = await import('../trpc/rbac')
const { enforceLabActive } = await import('../trpc/middleware/enforceLabActive')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

function setupLabMock(status: string) {
  mockSingle.mockResolvedValue({
    data: {
      id: 'tech-1',
      lab_id: 'lab-1',
      labs: { id: 'lab-1', status },
    },
    error: null,
  })
}

describe('enforceLabActive middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows access when lab status is ACTIVE', async () => {
    setupLabMock('ACTIVE')

    const router = createTRPCRouter({
      upload: labRestrictedProcedure
        .use(enforceLabActive())
        .query(() => 'upload-ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.upload()
    expect(result).toBe('upload-ok')
  })

  it('blocks access when lab status is PENDING', async () => {
    setupLabMock('PENDING')

    const router = createTRPCRouter({
      upload: labRestrictedProcedure
        .use(enforceLabActive())
        .query(() => 'upload-ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.upload()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller.upload()).rejects.toThrow(/pending verification/)
  })

  it('blocks access when lab status is SUSPENDED', async () => {
    setupLabMock('SUSPENDED')

    const router = createTRPCRouter({
      upload: labRestrictedProcedure
        .use(enforceLabActive())
        .query(() => 'upload-ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.upload()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(caller.upload()).rejects.toThrow(/suspended/)
  })

  it('ADMIN bypasses the status gate (no lab context)', async () => {
    // ADMIN has no ctx.lab — labRestrictedProcedure skips lab enrichment
    const router = createTRPCRouter({
      upload: labRestrictedProcedure
        .use(enforceLabActive())
        .query(() => 'admin-upload-ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.upload()
    expect(result).toBe('admin-upload-ok')
  })
})
