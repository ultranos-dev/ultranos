import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

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

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const { createCallerFactory, createTRPCRouter } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// UUIDs for test data
const MENTOR_ID = '00000000-0000-0000-0000-000000000001'
const MENTEE_ID = '00000000-0000-0000-0000-000000000002'
const PAIRING_ID = '00000000-0000-0000-0000-000000000010'
const LAB_ID = '00000000-0000-0000-0000-000000000020'

// ================================================================
// Supabase mock builder — uses mockImplementation per table
// ================================================================

function chainMock(resolveValue: any) {
  const terminal = {
    single: vi.fn().mockResolvedValue(resolveValue),
    maybeSingle: vi.fn().mockResolvedValue(resolveValue),
  }
  const chain: any = {
    ...terminal,
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  }
  // Make chaining return itself
  for (const key of ['eq', 'in', 'or', 'gt', 'lt', 'order', 'limit', 'select']) {
    chain[key] = vi.fn().mockReturnValue(chain)
  }
  chain.single = terminal.single
  chain.maybeSingle = terminal.maybeSingle
  return chain
}

function makeAdminCtx(fromImpl: (...args: any[]) => any) {
  return {
    supabase: {
      from: fromImpl,
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@test.com' } } }) } },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never,
    user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

function makeDoctorCtx() {
  return {
    supabase: { from: vi.fn(), auth: { admin: { getUserById: vi.fn() } }, rpc: vi.fn() } as never,
    user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

function makeLabTechCtx(fromImpl: (...args: any[]) => any) {
  return {
    supabase: {
      from: fromImpl,
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'tech@test.com' } } }) } },
      rpc: vi.fn(),
    } as never,
    user: { sub: MENTEE_ID, role: 'LAB_TECH', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

describe('Story 55.4: Mentorship Pairing Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ================================================================
  // admin.createMentorshipPairing
  // ================================================================

  describe('admin.createMentorshipPairing', () => {
    it('validates mentor is SUPERVISOR or LAB_MANAGER', async () => {
      const fromImpl = vi.fn().mockImplementation(() =>
        chainMock({ data: null, error: null }),
      )

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.createMentorshipPairing({
          mentorPractitionerId: MENTOR_ID,
          menteePractitionerId: MENTEE_ID,
          startDate: '2026-06-01',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('SUPERVISOR or LAB_MANAGER'),
      })
    })

    it('rejects if mentee already has ACTIVE pairing', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // mentor check — valid SUPERVISOR
          return chainMock({
            data: { practitioner_id: MENTOR_ID, lab_id: LAB_ID, lab_role: 'SUPERVISOR' },
            error: null,
          })
        }
        // mentee existing pairing — found
        return chainMock({ data: { id: PAIRING_ID }, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.createMentorshipPairing({
          mentorPractitionerId: MENTOR_ID,
          menteePractitionerId: MENTEE_ID,
          startDate: '2026-06-01',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('already has an active'),
      })
    })

    it('rejects if mentor and mentee are the same person', async () => {
      const fromImpl = vi.fn()
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.createMentorshipPairing({
          mentorPractitionerId: MENTOR_ID,
          menteePractitionerId: MENTOR_ID,
          startDate: '2026-06-01',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('same person'),
      })
    })

    it('emits CREATE audit event on success', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // mentor check — valid
          return chainMock({
            data: { practitioner_id: MENTOR_ID, lab_id: LAB_ID, lab_role: 'SUPERVISOR' },
            error: null,
          })
        }
        if (callCount === 2) {
          // mentee existing pairing — none
          return chainMock({ data: null, error: null })
        }
        // insert — returns the chain for insert().select().single()
        const insertChain = chainMock({
          data: { id: PAIRING_ID, status: 'ACTIVE', start_date: '2026-06-01', created_at: '2026-06-01T00:00:00Z' },
          error: null,
        })
        return { insert: vi.fn().mockReturnValue(insertChain) }
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.createMentorshipPairing({
        mentorPractitionerId: MENTOR_ID,
        menteePractitionerId: MENTEE_ID,
        startDate: '2026-06-01',
      })

      expect(result.id).toBe(PAIRING_ID)
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resourceType: 'MENTORSHIP',
          resourceId: PAIRING_ID,
        }),
      )
    })
  })

  // ================================================================
  // admin.dissolveMentorshipPairing
  // ================================================================

  describe('admin.dissolveMentorshipPairing', () => {
    it('sets status, reason, dissolved_at and emits UPDATE audit event', async () => {
      const fromImpl = vi.fn().mockImplementation(() => {
        const updateChain = chainMock({
          data: { id: PAIRING_ID, status: 'DISSOLVED' },
          error: null,
        })
        return { update: vi.fn().mockReturnValue(updateChain) }
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.dissolveMentorshipPairing({
        pairingId: PAIRING_ID,
        reason: 'COMPLETED',
        notes: 'All goals met',
      })

      expect(result.id).toBe(PAIRING_ID)
      expect(result.status).toBe('DISSOLVED')
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'MENTORSHIP',
          metadata: expect.objectContaining({ action: 'DISSOLVE', reason: 'COMPLETED' }),
        }),
      )
    })
  })

  // ================================================================
  // admin.updateMentorshipCheckin
  // ================================================================

  describe('admin.updateMentorshipCheckin', () => {
    it('upserts correctly and emits audit event', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // pairing exists check
          return chainMock({ data: { id: PAIRING_ID }, error: null })
        }
        // upsert
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.updateMentorshipCheckin({
        pairingId: PAIRING_ID,
        month: '2026-06',
        status: 'COMPLETED',
        notes: 'Good progress',
      })

      expect(result.success).toBe(true)
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'MENTORSHIP',
          metadata: expect.objectContaining({ action: 'CHECKIN', month: '2026-06', status: 'COMPLETED' }),
        }),
      )
    })
  })

  // ================================================================
  // admin.getMentorshipStats
  // ================================================================

  describe('admin.getMentorshipStats', () => {
    it('computes correct stats values', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        const chain = chainMock({ data: null, error: null })

        if (callCount === 1) {
          // active pairings
          chain.eq = vi.fn().mockResolvedValue({
            data: [
              { mentor_practitioner_id: 'a', mentee_practitioner_id: 'b', start_date: '2026-01-01' },
              { mentor_practitioner_id: 'c', mentee_practitioner_id: 'd', start_date: '2026-03-01' },
            ],
          })
          return { select: vi.fn().mockReturnValue(chain) }
        }
        if (callCount === 2) {
          // dissolved pairings
          chain.eq = vi.fn().mockResolvedValue({
            data: [{ start_date: '2025-06-01', dissolved_at: '2025-12-01' }],
          })
          return { select: vi.fn().mockReturnValue(chain) }
        }
        if (callCount === 3) {
          // total techs count
          return { select: vi.fn().mockResolvedValue({ count: 10 }) }
        }
        if (callCount === 4) {
          // completed checkins
          chain.eq = vi.fn().mockResolvedValue({ count: 8 })
          return { select: vi.fn().mockReturnValue(chain) }
        }
        if (callCount === 5) {
          // skipped checkins
          chain.eq = vi.fn().mockResolvedValue({ count: 2 })
          return { select: vi.fn().mockReturnValue(chain) }
        }
        return { select: vi.fn().mockReturnValue(chain) }
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const stats = await caller.getMentorshipStats()

      expect(stats.totalPaired).toBe(4)
      expect(stats.unmatchedTechs).toBe(6)
      expect(stats.checkinCompletionRate).toBe(80)
    })
  })

  // ================================================================
  // lab.getMyMentorship
  // ================================================================

  describe('lab.getMyMentorship', () => {
    it('returns pairing for current user as mentee', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // labRestrictedProcedure: lab_technicians lookup
          return chainMock({
            data: {
              id: 'tech-1',
              lab_id: LAB_ID,
              lab_role: 'LAB_TECH',
              labs: { id: LAB_ID, status: 'ACTIVE' },
            },
            error: null,
          })
        }
        if (callCount === 2) {
          // mentorship_pairings query
          return chainMock({
            data: {
              id: PAIRING_ID,
              mentor_practitioner_id: MENTOR_ID,
              mentee_practitioner_id: MENTEE_ID,
              goals: 'Learn QC procedures',
              start_date: '2026-05-01',
              lab_id: LAB_ID,
              mentor: { given_name: 'Alice' },
              mentee: { given_name: 'Bob' },
              labs: { lab_name: 'Central Lab' },
            },
            error: null,
          })
        }
        if (callCount === 3) {
          // mentorship_checkins query
          const chain = chainMock({ data: null, error: null })
          chain.order = vi.fn().mockResolvedValue({
            data: [{ month: '2026-05', status: 'COMPLETED' }],
          })
          chain.eq = vi.fn().mockReturnValue(chain)
          return { select: vi.fn().mockReturnValue(chain) }
        }
        return chainMock({ data: null, error: null })
      })

      const { labRouter } = await import('../trpc/routers/lab')
      const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl))
      const result = await caller.getMyMentorship()

      expect(result).not.toBeNull()
      expect(result!.role).toBe('MENTEE')
      expect(result!.partnerName).toBe('Alice')
      expect(result!.labName).toBe('Central Lab')
      expect(result!.goals).toBe('Learn QC procedures')
    })

    it('returns null when no active pairing', async () => {
      let callCount = 0
      const fromImpl = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({
            data: {
              id: 'tech-2',
              lab_id: LAB_ID,
              lab_role: 'LAB_TECH',
              labs: { id: LAB_ID, status: 'ACTIVE' },
            },
            error: null,
          })
        }
        // pairing query returns null
        return chainMock({ data: null, error: null })
      })

      const { labRouter } = await import('../trpc/routers/lab')
      const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl))
      const result = await caller.getMyMentorship()

      expect(result).toBeNull()
      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'READ',
          resourceType: 'MENTORSHIP',
        }),
      )
    })
  })

  // ================================================================
  // RBAC: non-ADMIN callers rejected
  // ================================================================

  describe('RBAC enforcement', () => {
    it('non-ADMIN callers rejected on admin mentorship endpoints with FORBIDDEN', async () => {
      const caller = createCallerFactory(adminRouter)(makeDoctorCtx())

      await expect(
        caller.createMentorshipPairing({
          mentorPractitionerId: MENTOR_ID,
          menteePractitionerId: MENTEE_ID,
          startDate: '2026-06-01',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      await expect(
        caller.dissolveMentorshipPairing({
          pairingId: PAIRING_ID,
          reason: 'COMPLETED',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      await expect(caller.getMentorshipStats()).rejects.toMatchObject({ code: 'FORBIDDEN' })

      await expect(caller.listEligibleMentors()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
