import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

// ── Environment stubs ───────────────────────────────────────
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// ── Supabase & db mock ──────────────────────────────────────
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

// ── Audit logger mock ───────────────────────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

// ── Crypto mock ─────────────────────────────────────────────
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((val: string) => `hmac_${val}`),
  encryptField: vi.fn((val: string) => `v1:encrypted_${val.slice(0, 10)}`),
  getEncryptionConfig: vi.fn(() => ({
    randomizedFields: ['report_conclusion', 'encrypted_content'],
  })),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({
    encryptionKey: 'a'.repeat(64),
    hmacKey: 'b'.repeat(64),
  })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ── Test helpers ────────────────────────────────────────────
function buildMockSupabase(overrides: Record<string, any> = {}) {
  const defaultSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const defaultSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: defaultSingle,
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      limit: vi.fn().mockReturnValue({
        single: defaultSingle,
      }),
    }),
    order: vi.fn().mockReturnValue({
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }),
  })
  const defaultInsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const defaultUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  const from = vi.fn((table: string) => {
    if (overrides[table]) return overrides[table]
    return {
      select: defaultSelect,
      insert: defaultInsert,
      update: defaultUpdate,
    }
  })

  return { from } as never
}

function makeAdminCtx(supabase: any) {
  return {
    supabase,
    user: { sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'ADMIN', sessionId: 'sess-1', orgId: 'org-1', status: null },
    headers: new Headers(),
  }
}

function makeNonAdminCtx(supabase: any, role = 'DOCTOR') {
  return {
    supabase,
    user: { sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role, sessionId: 'sess-1', orgId: 'org-1', status: null },
    headers: new Headers(),
  }
}

// ── Tests ───────────────────────────────────────────────────
describe('Story 22.3: Lab Approval & Suspension Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ────────────────────────────────────────────────────────────
  // admin.listLabs
  // ────────────────────────────────────────────────────────────
  describe('admin.listLabs', () => {
    it('returns paginated lab registrations', async () => {
      const labRows = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          lab_name: 'Alpha Lab',
          license_ref: 'LIC-001',
          accreditation_ref: 'ACC-001',
          status: 'PENDING',
          created_at: '2026-05-01T00:00:00Z',
          lab_technicians: [{
            practitioner_id: '22222222-2222-2222-2222-222222222222',
            practitioners: { given_name: 'Ali', family_name: 'Khan' },
          }],
        },
      ]

      // Supabase chain: select().order().range() then optionally .eq()
      const resolvedResult = { data: labRows, error: null, count: 1 }
      const rangeFn = vi.fn().mockResolvedValue(resolvedResult)
      const eqFn = vi.fn().mockResolvedValue(resolvedResult)
      const rangeObj = { eq: eqFn }
      Object.assign(rangeFn, { mockResolvedValue: rangeFn.mockResolvedValue })
      const orderFn = vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue(Object.assign(Promise.resolve(resolvedResult), { eq: eqFn })) })

      // Build a proper chainable mock
      const chainable: Record<string, any> = {}
      chainable.eq = vi.fn().mockReturnValue(chainable)
      chainable.order = vi.fn().mockReturnValue(chainable)
      chainable.range = vi.fn().mockReturnValue(chainable)
      chainable.then = (resolve: any) => resolve(resolvedResult)

      const selectFn = vi.fn().mockReturnValue(chainable)

      const supabase = buildMockSupabase({
        labs: { select: selectFn },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.listLabs({ status: 'ALL', cursor: 0, limit: 25 })

      expect(result.labs).toHaveLength(1)
      expect(result.labs[0]).toMatchObject({
        id: '11111111-1111-1111-1111-111111111111',
        labName: 'Alpha Lab',
        licenseReference: 'LIC-001',
        technicianName: 'Ali Khan',
        status: 'PENDING',
      })
      expect(result.total).toBe(1)
    })

    it('filters by status when not ALL', async () => {
      const resolvedResult = { data: [], error: null, count: 0 }
      const chainable: Record<string, any> = {}
      chainable.eq = vi.fn().mockReturnValue(chainable)
      chainable.order = vi.fn().mockReturnValue(chainable)
      chainable.range = vi.fn().mockReturnValue(chainable)
      chainable.then = (resolve: any) => resolve(resolvedResult)

      const selectFn = vi.fn().mockReturnValue(chainable)

      const supabase = buildMockSupabase({
        labs: { select: selectFn },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.listLabs({ status: 'PENDING' })

      expect(result.labs).toHaveLength(0)
      expect(chainable.eq).toHaveBeenCalledWith('status', 'PENDING')
    })
  })

  // ────────────────────────────────────────────────────────────
  // admin.reviewLab — APPROVE
  // ────────────────────────────────────────────────────────────
  describe('admin.reviewLab — APPROVE', () => {
    it('transitions PENDING → ACTIVE with audit event', async () => {
      const updateChain: Record<string, any> = {}
      updateChain.eq = vi.fn().mockReturnValue(updateChain)
      updateChain.select = vi.fn().mockResolvedValue({ error: null, count: 1 })
      const insertFn = vi.fn().mockResolvedValue({ error: null })

      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'PENDING' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue(updateChain),
        },
        lab_status_history: { insert: insertFn },
        lab_technicians: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { practitioner_id: '22222222-2222-2222-2222-222222222222' },
                  error: null,
                }),
              }),
            }),
          }),
        },
        notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.reviewLab({
        labId: '11111111-1111-1111-1111-111111111111',
        action: 'APPROVE',
        reason: 'Verified credentials',
      })

      expect(result).toMatchObject({
        success: true,
        previousStatus: 'PENDING',
        newStatus: 'ACTIVE',
      })

      // Audit event emitted
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_APPROVED',
          resourceType: 'LAB_REGISTRATION',
          resourceId: '11111111-1111-1111-1111-111111111111',
          metadata: expect.objectContaining({
            labAction: 'APPROVE',
            previousStatus: 'PENDING',
            newStatus: 'ACTIVE',
          }),
        }),
      )

      // Notification sent to technician — AC #5
      expect(supabase.from).toHaveBeenCalledWith('notifications')
    })
  })

  // ────────────────────────────────────────────────────────────
  // admin.reviewLab — SUSPEND
  // ────────────────────────────────────────────────────────────
  describe('admin.reviewLab — SUSPEND', () => {
    it('transitions ACTIVE → SUSPENDED with audit event', async () => {
      const updateChain: Record<string, any> = {}
      updateChain.eq = vi.fn().mockReturnValue(updateChain)
      updateChain.select = vi.fn().mockResolvedValue({ error: null, count: 1 })
      const insertFn = vi.fn().mockResolvedValue({ error: null })

      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue(updateChain),
        },
        lab_status_history: { insert: insertFn },
        lab_technicians: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { practitioner_id: '22222222-2222-2222-2222-222222222222' },
                  error: null,
                }),
              }),
            }),
          }),
        },
        notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.reviewLab({
        labId: '11111111-1111-1111-1111-111111111111',
        action: 'SUSPEND',
        reason: 'Compliance issue',
      })

      expect(result).toMatchObject({
        success: true,
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
      })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_SUSPENDED',
          resourceType: 'LAB_REGISTRATION',
          resourceId: '11111111-1111-1111-1111-111111111111',
        }),
      )
    })
  })

  // ────────────────────────────────────────────────────────────
  // admin.reviewLab — REACTIVATE
  // ────────────────────────────────────────────────────────────
  describe('admin.reviewLab — REACTIVATE', () => {
    it('transitions SUSPENDED → ACTIVE with audit event', async () => {
      const updateChain: Record<string, any> = {}
      updateChain.eq = vi.fn().mockReturnValue(updateChain)
      updateChain.select = vi.fn().mockResolvedValue({ error: null, count: 1 })
      const insertFn = vi.fn().mockResolvedValue({ error: null })

      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'SUSPENDED' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue(updateChain),
        },
        lab_status_history: { insert: insertFn },
        lab_technicians: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { practitioner_id: '22222222-2222-2222-2222-222222222222' },
                  error: null,
                }),
              }),
            }),
          }),
        },
        notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.reviewLab({
        labId: '11111111-1111-1111-1111-111111111111',
        action: 'REACTIVATE',
      })

      expect(result).toMatchObject({
        success: true,
        previousStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
      })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_REACTIVATED',
          resourceType: 'LAB_REGISTRATION',
          resourceId: '11111111-1111-1111-1111-111111111111',
        }),
      )
    })
  })

  // ────────────────────────────────────────────────────────────
  // admin.reviewLab — Invalid transitions
  // ────────────────────────────────────────────────────────────
  describe('admin.reviewLab — Invalid transitions', () => {
    it('rejects REACTIVATE on a PENDING lab', async () => {
      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'PENDING' },
                error: null,
              }),
            }),
          }),
        },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      await expect(
        caller.reviewLab({ labId: '11111111-1111-1111-1111-111111111111', action: 'REACTIVATE' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Cannot REACTIVATE'),
      })
    })

    it('rejects APPROVE on an ACTIVE lab', async () => {
      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'ACTIVE' },
                error: null,
              }),
            }),
          }),
        },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      await expect(
        caller.reviewLab({ labId: '11111111-1111-1111-1111-111111111111', action: 'APPROVE' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('rejects SUSPEND on a PENDING lab', async () => {
      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', status: 'PENDING' },
                error: null,
              }),
            }),
          }),
        },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      await expect(
        caller.reviewLab({ labId: '11111111-1111-1111-1111-111111111111', action: 'SUSPEND' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('returns NOT_FOUND for non-existent lab', async () => {
      const supabase = buildMockSupabase({
        labs: {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        },
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      await expect(
        caller.reviewLab({ labId: '00000000-0000-0000-0000-000000000000', action: 'APPROVE' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  // ────────────────────────────────────────────────────────────
  // RBAC — non-ADMIN callers rejected
  // ────────────────────────────────────────────────────────────
  describe('RBAC enforcement', () => {
    it('rejects DOCTOR calling admin.listLabs', async () => {
      const supabase = buildMockSupabase()
      const caller = createCallerFactory(adminRouter)(makeNonAdminCtx(supabase, 'DOCTOR'))
      await expect(caller.listLabs({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects LAB_TECH calling admin.reviewLab', async () => {
      const supabase = buildMockSupabase()
      const caller = createCallerFactory(adminRouter)(makeNonAdminCtx(supabase, 'LAB_TECH'))
      await expect(
        caller.reviewLab({ labId: '11111111-1111-1111-1111-111111111111', action: 'APPROVE' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects PHARMACIST calling admin.getLabDetail', async () => {
      const supabase = buildMockSupabase()
      const caller = createCallerFactory(adminRouter)(makeNonAdminCtx(supabase, 'PHARMACIST'))
      await expect(
        caller.getLabDetail({ labId: '11111111-1111-1111-1111-111111111111' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects unauthenticated user calling admin.listLabs', async () => {
      const supabase = buildMockSupabase()
      const caller = createCallerFactory(adminRouter)({
        supabase,
        user: null,
        headers: new Headers(),
      })
      await expect(caller.listLabs({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  // ────────────────────────────────────────────────────────────
  // enforceLabActive — blocks SUSPENDED and PENDING labs
  // ────────────────────────────────────────────────────────────
  describe('enforceLabActive middleware', () => {
    it('blocks SUSPENDED lab from uploading', async () => {
      const { enforceLabActive } = await import('../trpc/middleware/enforceLabActive')
      const middleware = enforceLabActive()

      const ctx = {
        lab: { technicianId: '22222222-2222-2222-2222-222222222222', labId: '11111111-1111-1111-1111-111111111111', labStatus: 'SUSPENDED' as const },
      }

      await expect(
        middleware({ ctx, input: {}, next: vi.fn() }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('suspended'),
      })
    })

    it('blocks PENDING lab from uploading', async () => {
      const { enforceLabActive } = await import('../trpc/middleware/enforceLabActive')
      const middleware = enforceLabActive()

      const ctx = {
        lab: { technicianId: '22222222-2222-2222-2222-222222222222', labId: '11111111-1111-1111-1111-111111111111', labStatus: 'PENDING' as const },
      }

      await expect(
        middleware({ ctx, input: {}, next: vi.fn() }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('pending'),
      })
    })

    it('allows ACTIVE lab to proceed', async () => {
      const { enforceLabActive } = await import('../trpc/middleware/enforceLabActive')
      const middleware = enforceLabActive()

      const mockNext = vi.fn().mockResolvedValue({ result: 'ok' })
      const ctx = {
        lab: { technicianId: '22222222-2222-2222-2222-222222222222', labId: '11111111-1111-1111-1111-111111111111', labStatus: 'ACTIVE' as const },
      }

      const result = await middleware({ ctx, input: {}, next: mockNext })
      expect(mockNext).toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────────────────
  // dashboardStats — live pendingLabApprovals
  // ────────────────────────────────────────────────────────────
  describe('admin.dashboardStats', () => {
    it('returns live pendingLabApprovals count', async () => {
      // Build a chainable mock that handles every table dashboardStats queries.
      // The router calls: labs (count PENDING), kyc_submissions (count + data),
      // prescribing_anomalies (.in() count x2), labs (oldest, .maybeSingle()),
      // audit_chain_verifications (.maybeSingle()), practitioners (count x3).
      const makeCountChain = (count: number) => {
        const chain: Record<string, any> = {}
        chain.eq = vi.fn().mockReturnValue(chain)
        chain.in = vi.fn().mockReturnValue(chain)
        chain.order = vi.fn().mockReturnValue(chain)
        chain.limit = vi.fn().mockReturnValue(chain)
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
        chain.then = (resolve: any) => resolve({ count, data: [], error: null })
        return chain
      }

      let labsCallIndex = 0
      const from = vi.fn((table: string) => {
        if (table === 'labs') {
          labsCallIndex++
          if (labsCallIndex === 1) {
            // First call: .select().eq('status','PENDING') → count=3
            const chain: Record<string, any> = {}
            chain.eq = vi.fn().mockReturnValue(chain)
            chain.then = (resolve: any) => resolve({ count: 3, error: null })
            return { select: vi.fn().mockReturnValue(chain) }
          }
          // Second call: oldest pending lab .eq().order().limit().maybeSingle()
          const chain: Record<string, any> = {}
          chain.eq = vi.fn().mockReturnValue(chain)
          chain.order = vi.fn().mockReturnValue(chain)
          chain.limit = vi.fn().mockReturnValue(chain)
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
          return { select: vi.fn().mockReturnValue(chain) }
        }
        return { select: vi.fn().mockReturnValue(makeCountChain(0)) }
      })

      const supabase = { from } as never
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
      const result = await caller.dashboardStats()

      expect(result.pendingLabApprovals).toBe(3)
    })
  })
})
