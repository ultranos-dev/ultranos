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

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { roleRestrictedProcedure } = await import('../trpc/rbac')
const { enforceResourceAccess } = await import('../trpc/middleware/enforceResourceAccess')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: vi.fn() } as never,
    user,
    headers: new Headers(),
  }
}

describe('enforceResourceAccess middleware', () => {
  it('DOCTOR can access Patient resources', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PATIENT'])
        .use(enforceResourceAccess('Patient'))
        .query(() => 'patient-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
    )
    expect(await caller.get()).toBe('patient-data')
  })

  it('DOCTOR can access Encounter resources', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR'])
        .use(enforceResourceAccess('Encounter'))
        .query(() => 'encounter-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'doc-1', role: 'DOCTOR', sessionId: 's1' }),
    )
    expect(await caller.get()).toBe('encounter-data')
  })

  it('PHARMACIST can access MedicationRequest resources', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PHARMACIST'])
        .use(enforceResourceAccess('MedicationRequest'))
        .query(() => 'rx-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    expect(await caller.get()).toBe('rx-data')
  })

  it('PHARMACIST is DENIED access to Encounter (SOAP notes)', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PHARMACIST'])
        .use(enforceResourceAccess('Encounter'))
        .query(() => 'encounter-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    await expect(caller.get()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('PHARMACIST is DENIED access to Observation (vitals)', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PHARMACIST'])
        .use(enforceResourceAccess('Observation'))
        .query(() => 'vitals-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'pharm-1', role: 'PHARMACIST', sessionId: 's1' }),
    )
    await expect(caller.get()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('PATIENT can access Consent resources', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PATIENT'])
        .use(enforceResourceAccess('Consent'))
        .query(() => 'consent-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' }),
    )
    expect(await caller.get()).toBe('consent-data')
  })

  it('PATIENT is DENIED access to Encounter resources', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'PATIENT'])
        .use(enforceResourceAccess('Encounter'))
        .query(() => 'encounter-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'patient-1', role: 'PATIENT', sessionId: 's1' }),
    )
    await expect(caller.get()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('ADMIN can access any resource type', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR'])
        .use(enforceResourceAccess('Encounter'))
        .query(() => 'encounter-data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    expect(await caller.get()).toBe('encounter-data')
  })

  it('unknown role is DENIED (fail-safe)', async () => {
    const router = createTRPCRouter({
      get: roleRestrictedProcedure(['DOCTOR', 'UNKNOWN_ROLE' as string])
        .use(enforceResourceAccess('Patient'))
        .query(() => 'data'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'UNKNOWN_ROLE', sessionId: 's1' }),
    )
    await expect(caller.get()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
