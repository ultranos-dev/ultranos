import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory, createTRPCRouter, protectedProcedure } = await import('../trpc/init')

describe('protectedProcedure (JWT auth placeholder)', () => {
  it('throws UNAUTHORIZED when user is null', async () => {
    // Create a test router with a protected route
    const testRouter = createTRPCRouter({
      secret: protectedProcedure.query(() => 'secret-data'),
    })

    const createCaller = createCallerFactory(testRouter)
    const caller = createCaller({
      supabase: { from: vi.fn() } as never,
      user: null,
      headers: new Headers(),
    })

    await expect(caller.secret()).rejects.toThrow(TRPCError)
    await expect(caller.secret()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('allows access when user is present in context', async () => {
    const testRouter = createTRPCRouter({
      secret: protectedProcedure.query(() => 'secret-data'),
    })

    const createCaller = createCallerFactory(testRouter)
    const caller = createCaller({
      supabase: { from: vi.fn() } as never,
      user: { sub: 'user-123', role: 'DOCTOR', sessionId: 'session-456' },
      headers: new Headers(),
    })

    const result = await caller.secret()
    expect(result).toBe('secret-data')
  })
})
