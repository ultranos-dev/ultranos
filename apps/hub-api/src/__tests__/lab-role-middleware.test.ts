import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabRole, LabPermission } from '@ultranos/shared-types'

// Mock Supabase client
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
const { enforceLabRole } = await import('../trpc/middleware/enforceLabRole')

function makeCtx(user: { sub: string; role: string; sessionId: string } | null) {
  return {
    supabase: { from: mockFrom } as never,
    user,
    headers: new Headers(),
  }
}

function setupLabTech(labRole: string) {
  mockSingle.mockResolvedValue({
    data: {
      id: 'tech-1',
      lab_id: 'lab-1',
      lab_role: labRole,
      labs: { id: 'lab-1', status: 'ACTIVE' },
    },
    error: null,
  })
}

describe('enforceLabRole middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test each role against each permission (28 combinations)
  const rolePermissionMatrix: Array<{ role: LabRole; permission: LabPermission; allowed: boolean }> = [
    // ENTER_RESULTS — all roles
    { role: LabRole.LAB_TECH, permission: LabPermission.ENTER_RESULTS, allowed: true },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.ENTER_RESULTS, allowed: true },
    { role: LabRole.SUPERVISOR, permission: LabPermission.ENTER_RESULTS, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.ENTER_RESULTS, allowed: true },
    // RELEASE_ROUTINE_RESULTS — SENIOR_TECH+
    { role: LabRole.LAB_TECH, permission: LabPermission.RELEASE_ROUTINE_RESULTS, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.RELEASE_ROUTINE_RESULTS, allowed: true },
    { role: LabRole.SUPERVISOR, permission: LabPermission.RELEASE_ROUTINE_RESULTS, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.RELEASE_ROUTINE_RESULTS, allowed: true },
    // RELEASE_ALL_RESULTS — SUPERVISOR+
    { role: LabRole.LAB_TECH, permission: LabPermission.RELEASE_ALL_RESULTS, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.RELEASE_ALL_RESULTS, allowed: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.RELEASE_ALL_RESULTS, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.RELEASE_ALL_RESULTS, allowed: true },
    // OVERRIDE_QC_LOCKOUT — SUPERVISOR+
    { role: LabRole.LAB_TECH, permission: LabPermission.OVERRIDE_QC_LOCKOUT, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.OVERRIDE_QC_LOCKOUT, allowed: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.OVERRIDE_QC_LOCKOUT, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.OVERRIDE_QC_LOCKOUT, allowed: true },
    // VIEW_STAFF — SUPERVISOR+
    { role: LabRole.LAB_TECH, permission: LabPermission.VIEW_STAFF, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.VIEW_STAFF, allowed: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.VIEW_STAFF, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.VIEW_STAFF, allowed: true },
    // MANAGE_STAFF_ROLES — LAB_MANAGER only
    { role: LabRole.LAB_TECH, permission: LabPermission.MANAGE_STAFF_ROLES, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.MANAGE_STAFF_ROLES, allowed: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.MANAGE_STAFF_ROLES, allowed: false },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.MANAGE_STAFF_ROLES, allowed: true },
    // VIEW_AUDIT_LOGS — SUPERVISOR+
    { role: LabRole.LAB_TECH, permission: LabPermission.VIEW_AUDIT_LOGS, allowed: false },
    { role: LabRole.SENIOR_TECH, permission: LabPermission.VIEW_AUDIT_LOGS, allowed: false },
    { role: LabRole.SUPERVISOR, permission: LabPermission.VIEW_AUDIT_LOGS, allowed: true },
    { role: LabRole.LAB_MANAGER, permission: LabPermission.VIEW_AUDIT_LOGS, allowed: true },
  ]

  for (const { role, permission, allowed } of rolePermissionMatrix) {
    it(`${role} ${allowed ? 'CAN' : 'CANNOT'} ${permission}`, async () => {
      setupLabTech(role)

      const router = createTRPCRouter({
        gated: labRestrictedProcedure
          .use(enforceLabRole(permission))
          .query(() => 'ok'),
      })
      const caller = createCallerFactory(router)(
        makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
      )

      if (allowed) {
        await expect(caller.gated()).resolves.toBe('ok')
      } else {
        await expect(caller.gated()).rejects.toMatchObject({
          code: 'FORBIDDEN',
          message: expect.stringContaining(permission),
        })
      }
    })
  }

  it('ADMIN bypasses lab role check', async () => {
    const router = createTRPCRouter({
      gated: labRestrictedProcedure
        .use(enforceLabRole(LabPermission.MANAGE_STAFF_ROLES))
        .query(() => 'admin-ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'admin-1', role: 'ADMIN', sessionId: 's1' }),
    )
    await expect(caller.gated()).resolves.toBe('admin-ok')
  })

  it('rejects when no lab context (non-ADMIN, non-LAB_TECH)', async () => {
    const router = createTRPCRouter({
      gated: labRestrictedProcedure
        .use(enforceLabRole(LabPermission.ENTER_RESULTS))
        .query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'DOCTOR', sessionId: 's1' }),
    )
    await expect(caller.gated()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('includes role in FORBIDDEN error message', async () => {
    setupLabTech(LabRole.LAB_TECH)

    const router = createTRPCRouter({
      gated: labRestrictedProcedure
        .use(enforceLabRole(LabPermission.MANAGE_STAFF_ROLES))
        .query(() => 'ok'),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    await expect(caller.gated()).rejects.toMatchObject({
      message: expect.stringContaining('LAB_TECH'),
    })
  })
})

describe('labRestrictedProcedure includes labRole in context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enriches context with labRole from database', async () => {
    setupLabTech('SUPERVISOR')

    const router = createTRPCRouter({
      check: labRestrictedProcedure.query(({ ctx }) => {
        return { labRole: (ctx as any).lab.labRole }
      }),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.check()
    expect(result.labRole).toBe('SUPERVISOR')
  })

  it('defaults labRole to LAB_TECH when column is null', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'tech-1',
        lab_id: 'lab-1',
        lab_role: null,
        labs: { id: 'lab-1', status: 'ACTIVE' },
      },
      error: null,
    })

    const router = createTRPCRouter({
      check: labRestrictedProcedure.query(({ ctx }) => {
        return { labRole: (ctx as any).lab.labRole }
      }),
    })
    const caller = createCallerFactory(router)(
      makeCtx({ sub: 'u1', role: 'LAB_TECH', sessionId: 's1' }),
    )
    const result = await caller.check()
    expect(result.labRole).toBe('LAB_TECH')
  })
})
