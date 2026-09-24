import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

// ============================================================
// RBAC granularity tests — Story 62.2 (M-ADM-4)
// The binary ADMIN role is split into SUPERADMIN (cross-org) and ORG_ADMIN
// (own-org). These tests pin the capability matrix + the legacy-ADMIN migration
// mapping (legacy ADMIN → treated as SUPERADMIN for zero-regression).
// ============================================================

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (d: any) => d,
    fromRow: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const { isSuperAdmin, isAdminRole, SUPERADMIN_ROLES, ORG_ADMIN_ROLES, ADMIN_ROLES, roleRestrictedProcedure, superAdminProcedure } =
  await import('../trpc/rbac')
const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')

function makeCtx(role: string) {
  return {
    supabase: { from: vi.fn() } as never,
    user: { sub: 'u1', role: role as never, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  }
}

describe('isSuperAdmin (cross-org capability)', () => {
  it('is true for SUPERADMIN and PLATFORM_ADMIN', () => {
    expect(isSuperAdmin('SUPERADMIN')).toBe(true)
    expect(isSuperAdmin('PLATFORM_ADMIN')).toBe(true)
  })

  it('is true for legacy ADMIN (backward-compatible migration mapping)', () => {
    expect(isSuperAdmin('ADMIN')).toBe(true)
  })

  it('is FALSE for ORG_ADMIN (own-org only)', () => {
    expect(isSuperAdmin('ORG_ADMIN')).toBe(false)
  })

  it('is false for non-admin roles and empty/undefined', () => {
    expect(isSuperAdmin('DOCTOR')).toBe(false)
    expect(isSuperAdmin('')).toBe(false)
    expect(isSuperAdmin(undefined)).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
  })
})

describe('isAdminRole (any administrator)', () => {
  it('is true for every admin variant', () => {
    for (const r of ['ADMIN', 'SUPERADMIN', 'ORG_ADMIN', 'PLATFORM_ADMIN']) {
      expect(isAdminRole(r)).toBe(true)
    }
  })
  it('is false for clinical/patient roles', () => {
    expect(isAdminRole('DOCTOR')).toBe(false)
    expect(isAdminRole('PATIENT')).toBe(false)
  })
})

describe('role sets — migration mapping', () => {
  it('legacy ADMIN maps into the SUPERADMIN set (zero-regression)', () => {
    expect(SUPERADMIN_ROLES.has('ADMIN')).toBe(true)
    expect(SUPERADMIN_ROLES.has('SUPERADMIN')).toBe(true)
  })
  it('ORG_ADMIN is NOT a super-admin', () => {
    expect(ORG_ADMIN_ROLES.has('ORG_ADMIN')).toBe(true)
    expect(SUPERADMIN_ROLES.has('ORG_ADMIN')).toBe(false)
  })
  it('ADMIN_ROLES is the union of both', () => {
    for (const r of [...SUPERADMIN_ROLES, ...ORG_ADMIN_ROLES]) {
      expect(ADMIN_ROLES.has(r)).toBe(true)
    }
  })
})

describe('superAdminProcedure gate', () => {
  const router = createTRPCRouter({
    crossOrg: superAdminProcedure.query(() => 'ok'),
  })

  it('admits SUPERADMIN', async () => {
    const caller = createCallerFactory(router)(makeCtx('SUPERADMIN'))
    expect(await caller.crossOrg()).toBe('ok')
  })

  it('admits legacy ADMIN (mapped to super-admin)', async () => {
    const caller = createCallerFactory(router)(makeCtx('ADMIN'))
    expect(await caller.crossOrg()).toBe('ok')
  })

  it('REJECTS ORG_ADMIN (cross-org denied)', async () => {
    const caller = createCallerFactory(router)(makeCtx('ORG_ADMIN'))
    await expect(caller.crossOrg()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects clinical roles', async () => {
    const caller = createCallerFactory(router)(makeCtx('DOCTOR'))
    await expect(caller.crossOrg()).rejects.toThrow(TRPCError)
  })
})

describe('roleRestrictedProcedure bypass covers all admin variants', () => {
  const router = createTRPCRouter({
    clinicianOnly: roleRestrictedProcedure(['DOCTOR']).query(() => 'ok'),
  })

  it('ORG_ADMIN retains the admin bypass for org-scoped clinical endpoints', async () => {
    const caller = createCallerFactory(router)(makeCtx('ORG_ADMIN'))
    expect(await caller.clinicianOnly()).toBe('ok')
  })

  it('SUPERADMIN retains the admin bypass', async () => {
    const caller = createCallerFactory(router)(makeCtx('SUPERADMIN'))
    expect(await caller.clinicianOnly()).toBe('ok')
  })
})
