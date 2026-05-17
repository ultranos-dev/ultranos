import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockEmit = vi.fn().mockResolvedValue({})

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

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockEmit,
  })),
}))

// Mock subscription-lifecycle side-effects (tested separately in subscription-lifecycle.test.ts)
vi.mock('@/lib/subscription-lifecycle', () => ({
  scheduleUserSuspension: vi.fn().mockResolvedValue({ scheduledCount: 0 }),
  reactivateUsersForModule: vi.fn().mockResolvedValue({ reactivatedCount: 0 }),
}))

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}

const { createCallerFactory } = await import('../trpc/init')
const { subscriptionRouter } = await import('../trpc/routers/subscription')

const createCaller = createCallerFactory(subscriptionRouter)

const TEST_ORG_ID = '00000000-0000-4000-a000-000000000001'
const TEST_SUB_ID = '00000000-0000-4000-a000-000000000010'
const TEST_SUB_ID_2 = '00000000-0000-4000-a000-000000000020'

function makeCtx(role: string, orgId: string | null = TEST_ORG_ID) {
  return {
    supabase: mockSupabase as never,
    user: { sub: 'user-admin-1', role, sessionId: 'sess-1', orgId, status: null },
    headers: new Headers(),
  }
}

describe('Story 27.5 — Admin Subscription Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Task 1.2: getOrgSubscriptions ──────────────────────────────

  describe('getOrgSubscriptions', () => {
    it('returns org details + subscriptions + total monthly cost for ADMIN', async () => {
      const orgData = {
        id: TEST_ORG_ID,
        name: 'Test Clinic',
        status: 'ACTIVE',
        trial_ends_at: null,
        billing_email: 'admin@test.com',
      }

      const subsData = [
        {
          id: TEST_SUB_ID,
          org_id: TEST_ORG_ID,
          module_code: 'OPD_LITE',
          status: 'ACTIVE',
          started_at: '2026-05-01T00:00:00Z',
          expires_at: '2026-05-31T00:00:00Z',
          cancelled_at: null,
          modules: { display_name: 'OPD Lite', base_price_usd: 50 },
        },
        {
          id: TEST_SUB_ID_2,
          org_id: TEST_ORG_ID,
          module_code: 'LAB_LITE',
          status: 'ACTIVE',
          started_at: '2026-05-01T00:00:00Z',
          expires_at: '2026-05-31T00:00:00Z',
          cancelled_at: null,
          modules: { display_name: 'Lab Lite', base_price_usd: 30 },
        },
      ]

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: orgData, error: null }),
              }),
            }),
          }
        }
        if (table === 'org_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: subsData, error: null }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })

      const caller = createCaller(makeCtx('ADMIN'))
      const result = await caller.getOrgSubscriptions()

      expect(result.organization.name).toBe('Test Clinic')
      expect(result.organization.status).toBe('ACTIVE')
      expect(result.subscriptions).toHaveLength(2)
      expect(result.totalMonthlyCostUsd).toBe(80)
    })

    it('rejects non-ADMIN roles with FORBIDDEN', async () => {
      const caller = createCaller(makeCtx('DOCTOR'))
      await expect(caller.getOrgSubscriptions()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  // ── Task 1.3: getAvailableModules ──────────────────────────────

  describe('getAvailableModules', () => {
    it('returns only unsubscribed active modules', async () => {
      const allModules = [
        { id: 'm1', code: 'OPD_LITE', display_name: 'OPD Lite', description: 'Outpatient', base_price_usd: 50, is_active: true },
        { id: 'm2', code: 'PHARMACY_LITE', display_name: 'Pharmacy Lite', description: 'Pharmacy', base_price_usd: 40, is_active: true },
        { id: 'm3', code: 'LAB_LITE', display_name: 'Lab Lite', description: 'Lab', base_price_usd: 30, is_active: true },
      ]
      const existingSubs = [
        { module_code: 'OPD_LITE' },
      ]

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'modules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: allModules, error: null }),
              }),
            }),
          }
        }
        if (table === 'org_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                // .in('status', [...]) resolves directly
                in: vi.fn().mockResolvedValue({ data: existingSubs, error: null }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })

      const caller = createCaller(makeCtx('ADMIN'))
      const result = await caller.getAvailableModules()

      expect(result.modules).toHaveLength(2)
      expect(result.modules.map((m: any) => m.code)).toEqual(['PHARMACY_LITE', 'LAB_LITE'])
    })

    it('rejects non-ADMIN roles with FORBIDDEN', async () => {
      const caller = createCaller(makeCtx('PHARMACIST'))
      await expect(caller.getAvailableModules()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  // ── Task 1.4: addModule ────────────────────────────────────────

  describe('addModule', () => {
    function mockAddModuleTables(orgData: any, existingSub: any, newSub: any) {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'modules') {
          // P4: addModule now validates moduleCode against DB
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { code: 'OPD_LITE' }, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: orgData, error: null }),
              }),
            }),
          }
        }
        if (table === 'org_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingSub, error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: newSub, error: null }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })
    }

    it('creates subscription with status matching org status (ACTIVE)', async () => {
      const newSub = {
        id: 'new-sub-1',
        org_id: TEST_ORG_ID,
        module_code: 'PHARMACY_LITE',
        status: 'ACTIVE',
        started_at: '2026-05-14T00:00:00Z',
        expires_at: '2026-06-13T00:00:00Z',
        cancelled_at: null,
      }

      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'ACTIVE', trial_ends_at: null },
        null, // no existing sub
        newSub,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      const result = await caller.addModule({ moduleCode: 'PHARMACY_LITE' })

      expect(result.subscription.status).toBe('ACTIVE')
      expect(result.subscription.moduleCode).toBe('PHARMACY_LITE')
    })

    it('creates subscription with TRIAL status when org is in TRIAL', async () => {
      const newSub = {
        id: 'new-sub-2',
        org_id: TEST_ORG_ID,
        module_code: 'LAB_LITE',
        status: 'TRIAL',
        started_at: '2026-05-14T00:00:00Z',
        expires_at: '2026-06-14T00:00:00Z',
        cancelled_at: null,
      }

      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'TRIAL', trial_ends_at: '2026-06-14T00:00:00Z' },
        null,
        newSub,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      const result = await caller.addModule({ moduleCode: 'LAB_LITE' })

      expect(result.subscription.status).toBe('TRIAL')
    })

    it('rejects addModule for already-subscribed module', async () => {
      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'ACTIVE', trial_ends_at: null },
        { id: 'existing-sub', status: 'ACTIVE' }, // existing active sub
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.addModule({ moduleCode: 'OPD_LITE' })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })

    it('rejects non-ADMIN role for addModule', async () => {
      const caller = createCaller(makeCtx('DOCTOR'))
      await expect(caller.addModule({ moduleCode: 'OPD_LITE' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('rejects addModule for SUSPENDED org', async () => {
      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'SUSPENDED', trial_ends_at: null },
        null,
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.addModule({ moduleCode: 'OPD_LITE' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('rejects addModule for CANCELLED org', async () => {
      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'CANCELLED', trial_ends_at: null },
        null,
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.addModule({ moduleCode: 'OPD_LITE' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('rejects addModule for TRIAL org with null trial_ends_at', async () => {
      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'TRIAL', trial_ends_at: null },
        null,
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.addModule({ moduleCode: 'LAB_LITE' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('emits audit event on successful addModule', async () => {
      const newSub = {
        id: 'new-sub-audit',
        org_id: TEST_ORG_ID,
        module_code: 'PHARMACY_LITE',
        status: 'ACTIVE',
        started_at: '2026-05-14T00:00:00Z',
        expires_at: '2026-06-13T00:00:00Z',
        cancelled_at: null,
      }

      mockAddModuleTables(
        { id: TEST_ORG_ID, status: 'ACTIVE', trial_ends_at: null },
        null,
        newSub,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await caller.addModule({ moduleCode: 'PHARMACY_LITE' })

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resourceType: 'Subscription',
          actorRole: 'ADMIN',
          actorId: 'user-admin-1',
        }),
      )
    })
  })

  // ── Task 1.5: removeModule ─────────────────────────────────────

  describe('removeModule', () => {
    function mockRemoveModuleTables(existingSub: any, cancelledSub: any) {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'org_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingSub, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: cancelledSub, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      })
    }

    it('sets cancelled_at and status CANCELLED, does not delete', async () => {
      const existingSub = {
        id: TEST_SUB_ID,
        org_id: TEST_ORG_ID,
        module_code: 'OPD_LITE',
        status: 'ACTIVE',
        expires_at: '2026-05-31T00:00:00Z',
      }

      const cancelledSub = {
        id: TEST_SUB_ID,
        org_id: TEST_ORG_ID,
        module_code: 'OPD_LITE',
        status: 'CANCELLED',
        started_at: '2026-05-01T00:00:00Z',
        expires_at: '2026-05-31T00:00:00Z',
        cancelled_at: '2026-05-14T12:00:00Z',
      }

      mockRemoveModuleTables(existingSub, cancelledSub)

      const caller = createCaller(makeCtx('ADMIN'))
      const result = await caller.removeModule({ subscriptionId: TEST_SUB_ID })

      expect(result.subscription.status).toBe('CANCELLED')
      expect(result.subscription.cancelledAt).toBeTruthy()
    })

    it('rejects non-ADMIN role for removeModule', async () => {
      const caller = createCaller(makeCtx('LAB_TECH'))
      await expect(caller.removeModule({ subscriptionId: TEST_SUB_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('rejects re-cancellation of already cancelled subscription', async () => {
      mockRemoveModuleTables(
        {
          id: TEST_SUB_ID,
          org_id: TEST_ORG_ID,
          module_code: 'OPD_LITE',
          status: 'CANCELLED',
          expires_at: '2026-05-31T00:00:00Z',
        },
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.removeModule({ subscriptionId: TEST_SUB_ID })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('rejects removeModule for subscription belonging to another org', async () => {
      const OTHER_ORG_ID = '00000000-0000-4000-a000-000000000099'
      mockRemoveModuleTables(
        {
          id: TEST_SUB_ID,
          org_id: OTHER_ORG_ID, // belongs to different org
          module_code: 'OPD_LITE',
          status: 'ACTIVE',
          expires_at: '2026-05-31T00:00:00Z',
        },
        null,
      )

      const caller = createCaller(makeCtx('ADMIN'))
      await expect(caller.removeModule({ subscriptionId: TEST_SUB_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('emits audit event on successful removeModule', async () => {
      const existingSub = {
        id: TEST_SUB_ID,
        org_id: TEST_ORG_ID,
        module_code: 'OPD_LITE',
        status: 'ACTIVE',
        expires_at: '2026-05-31T00:00:00Z',
      }

      const cancelledSub = {
        id: TEST_SUB_ID,
        org_id: TEST_ORG_ID,
        module_code: 'OPD_LITE',
        status: 'CANCELLED',
        started_at: '2026-05-01T00:00:00Z',
        expires_at: '2026-05-31T00:00:00Z',
        cancelled_at: '2026-05-14T12:00:00Z',
      }

      mockRemoveModuleTables(existingSub, cancelledSub)

      const caller = createCaller(makeCtx('ADMIN'))
      await caller.removeModule({ subscriptionId: TEST_SUB_ID })

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'Subscription',
          actorRole: 'ADMIN',
          metadata: expect.objectContaining({ cancellation: true }),
        }),
      )
    })
  })
})
