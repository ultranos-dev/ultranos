import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { createTRPCRouter, createCallerFactory, protectedProcedure } =
  await import('../trpc/init')
const { roleRestrictedProcedure } = await import('../trpc/rbac')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: vi.fn() } as never,
    user,
    headers: new Headers(),
  }
}

describe('roleRestrictedProcedure', () => {
  it('allows access for an authorized role', async () => {
    const router = createTRPCRouter({
      clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'DOCTOR', sessionId: 's1' }),
    )
    const result = await caller.clinicianOnly()
    expect(result).toBe('ok')
  })

  it('allows access when role is one of multiple allowed roles', async () => {
    const router = createTRPCRouter({
      multi: roleRestrictedProcedure(['DOCTOR', 'PHARMACIST']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    const result = await caller.multi()
    expect(result).toBe('ok')
  })

  it('denies access (FORBIDDEN) for an unauthorized role', async () => {
    const router = createTRPCRouter({
      clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    await expect(caller.clinicianOnly()).rejects.toThrow(TRPCError)
    await expect(caller.clinicianOnly()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('denies access (UNAUTHORIZED) when user is null', async () => {
    const router = createTRPCRouter({
      clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(makeCtx(null))
    await expect(caller.clinicianOnly()).rejects.toThrow(TRPCError)
    await expect(caller.clinicianOnly()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('denies access when role is empty string (fail-safe)', async () => {
    const router = createTRPCRouter({
      clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: '', sessionId: 's1' }),
    )
    await expect(caller.clinicianOnly()).rejects.toThrow(TRPCError)
    await expect(caller.clinicianOnly()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('ADMIN role has access to everything via roleRestrictedProcedure', async () => {
    const router = createTRPCRouter({
      clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'ADMIN', sessionId: 's1' }),
    )
    const result = await caller.clinicianOnly()
    expect(result).toBe('ok')
  })

  it('PATIENT role is denied access to clinician endpoints', async () => {
    const router = createTRPCRouter({
      clinical: roleRestrictedProcedure(['DOCTOR', 'PHARMACIST']).query(() => 'data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' }),
    )
    await expect(caller.clinical()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
