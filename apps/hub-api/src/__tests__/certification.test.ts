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

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')
const { labRouter } = await import('../trpc/routers/lab')

// UUIDs
const PATHWAY_ID = '00000000-0000-0000-0000-000000000100'
const PRACTITIONER_ID = '00000000-0000-0000-0000-000000000200'
const PROGRESS_ID = '00000000-0000-0000-0000-000000000300'
const CREDENTIAL_ID = '00000000-0000-0000-0000-000000000400'
const ORG_ID = '00000000-0000-0000-0000-000000000500'

// ================================================================
// Supabase mock builder
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
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // Make chain thenable so `await chain` resolves to resolveValue
    then: (resolve: any) => resolve(resolveValue),
  }
  for (const key of ['eq', 'in', 'or', 'gt', 'lt', 'lte', 'gte', 'not', 'order', 'limit', 'range', 'select', 'insert', 'update', 'delete']) {
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
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@test.com' } } }) } },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never,
    user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: ORG_ID, status: null },
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
      auth: { admin: { getUserById: vi.fn() } },
      rpc: vi.fn(),
    } as never,
    user: { sub: PRACTITIONER_ID, role: 'LAB_TECH', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

const SAMPLE_MILESTONES = [
  { title: 'Safety Training', type: 'MODULE_COMPLETION' as const, required_count: 1 },
  { title: 'Blood Draw Supervision', type: 'SUPERVISED_PROCEDURE' as const, required_count: 5 },
]

describe('Story 55.5: Certification & Credential Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ================================================================
  // 11.1: Pathway CRUD validation
  // ================================================================

  describe('admin.createCertificationPathway', () => {
    it('creates a pathway with valid milestones', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'practitioners') {
          return chainMock({ data: { org_id: ORG_ID }, error: null })
        }
        if (table === 'certification_pathways') {
          return chainMock({ data: { id: PATHWAY_ID }, error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.createCertificationPathway({
        name: 'Lab Tech L1',
        description: 'Entry-level certification',
        milestones: SAMPLE_MILESTONES,
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe(PATHWAY_ID)
    })

    it('rejects pathway with empty name', async () => {
      const fromImpl = vi.fn().mockReturnValue(chainMock({ data: null, error: null }))
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))

      await expect(
        caller.createCertificationPathway({
          name: '',
          milestones: SAMPLE_MILESTONES,
        }),
      ).rejects.toThrow()
    })

    it('rejects pathway with no milestones', async () => {
      const fromImpl = vi.fn().mockReturnValue(chainMock({ data: null, error: null }))
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))

      await expect(
        caller.createCertificationPathway({
          name: 'Test',
          milestones: [],
        }),
      ).rejects.toThrow()
    })

    it('rejects pathway with invalid milestone type', async () => {
      const fromImpl = vi.fn().mockReturnValue(chainMock({ data: null, error: null }))
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))

      await expect(
        caller.createCertificationPathway({
          name: 'Test',
          milestones: [{ title: 'X', type: 'INVALID_TYPE' as any, required_count: 1 }],
        }),
      ).rejects.toThrow()
    })

    it('rejects pathway with required_count <= 0', async () => {
      const fromImpl = vi.fn().mockReturnValue(chainMock({ data: null, error: null }))
      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))

      await expect(
        caller.createCertificationPathway({
          name: 'Test',
          milestones: [{ title: 'X', type: 'MODULE_COMPLETION', required_count: 0 }],
        }),
      ).rejects.toThrow()
    })

    it('rejects non-admin callers', async () => {
      const caller = createCallerFactory(adminRouter)(makeDoctorCtx())

      await expect(
        caller.createCertificationPathway({
          name: 'Test',
          milestones: SAMPLE_MILESTONES,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  // ================================================================
  // 11.2: Milestone review flow
  // ================================================================

  describe('admin.reviewMilestone', () => {
    it('approves a SUBMITTED milestone', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          const mock = chainMock({
            data: {
              id: PROGRESS_ID,
              status: 'SUBMITTED',
              pathway_id: PATHWAY_ID,
              practitioner_id: PRACTITIONER_ID,
              milestone_index: 0,
            },
            error: null,
          })
          return mock
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.reviewMilestone({
        progressId: PROGRESS_ID,
        action: 'APPROVE',
        note: 'Excellent work',
      })

      expect(result.success).toBe(true)
      expect(result.newStatus).toBe('APPROVED')
    })

    it('rejects a SUBMITTED milestone', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          return chainMock({
            data: {
              id: PROGRESS_ID,
              status: 'SUBMITTED',
              pathway_id: PATHWAY_ID,
              practitioner_id: PRACTITIONER_ID,
              milestone_index: 0,
            },
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.reviewMilestone({
        progressId: PROGRESS_ID,
        action: 'REJECT',
        note: 'Needs more evidence',
      })

      expect(result.success).toBe(true)
      expect(result.newStatus).toBe('REJECTED')
    })

    it('rejects review of PENDING milestone', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          return chainMock({
            data: {
              id: PROGRESS_ID,
              status: 'PENDING',
              pathway_id: PATHWAY_ID,
              practitioner_id: PRACTITIONER_ID,
              milestone_index: 0,
            },
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.reviewMilestone({
          progressId: PROGRESS_ID,
          action: 'APPROVE',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('rejects review of already APPROVED milestone', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          return chainMock({
            data: {
              id: PROGRESS_ID,
              status: 'APPROVED',
              pathway_id: PATHWAY_ID,
              practitioner_id: PRACTITIONER_ID,
              milestone_index: 0,
            },
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.reviewMilestone({
          progressId: PROGRESS_ID,
          action: 'APPROVE',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
  })

  // ================================================================
  // 11.3: Credential issuance
  // ================================================================

  describe('admin.issueCredential', () => {
    it('issues credential when all milestones are approved', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_pathways') {
          return chainMock({
            data: { id: PATHWAY_ID, milestones: SAMPLE_MILESTONES, status: 'ACTIVE' },
            error: null,
          })
        }
        if (table === 'certification_progress') {
          return chainMock({
            data: [
              { id: 'p1', status: 'APPROVED' },
              { id: 'p2', status: 'APPROVED' },
            ],
            error: null,
          })
        }
        if (table === 'certification_credentials') {
          return chainMock({ data: { id: CREDENTIAL_ID }, error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.issueCredential({
        practitionerId: PRACTITIONER_ID,
        pathwayId: PATHWAY_ID,
        expiresAt: '2027-01-01T00:00:00.000Z',
      })

      expect(result.success).toBe(true)
      expect(result.credentialId).toBe(CREDENTIAL_ID)
      expect(result.certificateHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256
    })

    it('rejects credential when milestones are not all approved', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_pathways') {
          return chainMock({
            data: { id: PATHWAY_ID, milestones: SAMPLE_MILESTONES, status: 'ACTIVE' },
            error: null,
          })
        }
        if (table === 'certification_progress') {
          return chainMock({
            data: [
              { id: 'p1', status: 'APPROVED' },
              { id: 'p2', status: 'SUBMITTED' },
            ],
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.issueCredential({
          practitionerId: PRACTITIONER_ID,
          pathwayId: PATHWAY_ID,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('rejects when no progress records exist', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          return chainMock({ data: [], error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.issueCredential({
          practitionerId: PRACTITIONER_ID,
          pathwayId: PATHWAY_ID,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // ================================================================
  // 11.4: lab.getMyCertifications returns only current user's data
  // ================================================================

  describe('lab.getMyCertifications', () => {
    it('returns pathways for the authenticated user', async () => {
      const certProgressData = [
        {
          id: PROGRESS_ID,
          pathway_id: PATHWAY_ID,
          milestone_index: 0,
          status: 'APPROVED',
          evidence_ref: null,
          reviewer_note: null,
          approved_at: '2026-05-01T00:00:00Z',
          submitted_at: '2026-04-28T00:00:00Z',
          created_at: '2026-04-01T00:00:00Z',
          certification_pathways: {
            id: PATHWAY_ID,
            name: 'Lab Tech L1',
            milestones: [{ title: 'Safety', type: 'MODULE_COMPLETION', required_count: 1 }],
            status: 'ACTIVE',
          },
        },
      ]

      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'lab_technicians') {
          // RBAC middleware: .select().eq().single()
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: PRACTITIONER_ID,
                    lab_id: 'lab-1',
                    lab_role: 'LAB_TECH',
                    labs: { id: 'lab-1', status: 'ACTIVE' },
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'certification_progress') {
          return chainMock({ data: certProgressData, error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl))
      const result = await caller.getMyCertifications()

      expect(result.pathways).toHaveLength(1)
      expect(result.pathways[0].pathwayName).toBe('Lab Tech L1')
      expect(result.pathways[0].completionPct).toBe(100)
    })
  })

  // ================================================================
  // 11.5: Audit event emission
  // ================================================================

  describe('audit events', () => {
    it('emits CERTIFICATION_PATHWAY_CREATED on create', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'practitioners') {
          return chainMock({ data: { org_id: ORG_ID }, error: null })
        }
        if (table === 'certification_pathways') {
          return chainMock({ data: { id: PATHWAY_ID }, error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await caller.createCertificationPathway({
        name: 'Audit Test',
        milestones: SAMPLE_MILESTONES,
      })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATION_PATHWAY_CREATED',
          resourceType: 'CERTIFICATION_PATHWAY',
          resourceId: PATHWAY_ID,
        }),
      )
    })

    it('emits CERTIFICATION_MILESTONE_REVIEWED on review', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_progress') {
          return chainMock({
            data: {
              id: PROGRESS_ID,
              status: 'SUBMITTED',
              pathway_id: PATHWAY_ID,
              practitioner_id: PRACTITIONER_ID,
              milestone_index: 0,
            },
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await caller.reviewMilestone({
        progressId: PROGRESS_ID,
        action: 'APPROVE',
      })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATION_MILESTONE_REVIEWED',
          resourceType: 'CERTIFICATION_PROGRESS',
        }),
      )
    })

    it('emits CERTIFICATION_CREDENTIAL_ISSUED on issuance', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_pathways') {
          return chainMock({
            data: { id: PATHWAY_ID, milestones: SAMPLE_MILESTONES, status: 'ACTIVE' },
            error: null,
          })
        }
        if (table === 'certification_progress') {
          return chainMock({
            data: [{ id: 'p1', status: 'APPROVED' }],
            error: null,
          })
        }
        if (table === 'certification_credentials') {
          return chainMock({ data: { id: CREDENTIAL_ID }, error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await caller.issueCredential({
        practitionerId: PRACTITIONER_ID,
        pathwayId: PATHWAY_ID,
      })

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATION_CREDENTIAL_ISSUED',
          resourceType: 'CERTIFICATION_CREDENTIAL',
        }),
      )
    })

    it('emits CERTIFICATION_PROGRESS_VIEWED on lab.getMyCertifications', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'lab_technicians') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: PRACTITIONER_ID,
                    lab_id: 'lab-1',
                    lab_role: 'LAB_TECH',
                    labs: { id: 'lab-1', status: 'ACTIVE' },
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'certification_progress') {
          return chainMock({ data: [], error: null })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(labRouter)(makeLabTechCtx(fromImpl))
      await caller.getMyCertifications()

      expect(mockAuditEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATION_PROGRESS_VIEWED',
          resourceType: 'CERTIFICATION_PROGRESS',
        }),
      )
    })
  })

  // ================================================================
  // 11.1 continued: Archive pathway
  // ================================================================

  describe('admin.archiveCertificationPathway', () => {
    it('archives a pathway', async () => {
      // Router: .update().eq('id',...).eq('status','ACTIVE').select('id').single()
      // single() must return { data: { id }, error: null } to avoid CONFLICT throw
      const fromImpl = vi.fn().mockImplementation(() =>
        chainMock({ data: { id: PATHWAY_ID }, error: null }),
      )

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      const result = await caller.archiveCertificationPathway({ id: PATHWAY_ID })

      expect(result.success).toBe(true)
    })
  })

  // ================================================================
  // Assign pathway
  // ================================================================

  describe('admin.assignPathway', () => {
    it('rejects assignment to archived pathway', async () => {
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_pathways') {
          return chainMock({
            data: { id: PATHWAY_ID, milestones: SAMPLE_MILESTONES, status: 'ARCHIVED' },
            error: null,
          })
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.assignPathway({
          practitionerId: PRACTITIONER_ID,
          pathwayId: PATHWAY_ID,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('rejects duplicate assignment', async () => {
      // The assignPathway code calls:
      // 1. certification_pathways.select().eq().single() -> pathway data
      // 2. certification_progress.select().eq().eq().limit() -> existing records (must be non-empty)
      // The chain mock resolves with data for all calls, so we need to track call order.
      let progressCallCount = 0
      const fromImpl = vi.fn().mockImplementation((table: string) => {
        if (table === 'certification_pathways') {
          return chainMock({
            data: { id: PATHWAY_ID, milestones: SAMPLE_MILESTONES, status: 'ACTIVE' },
            error: null,
          })
        }
        if (table === 'certification_progress') {
          progressCallCount++
          // First call is the "check existing" select — return non-empty array
          // Chain mock resolves from the terminal (single/maybeSingle) but
          // the code uses no terminal — it awaits the chain directly.
          // Actually, the code does: .select('id').eq().eq().limit()
          // which resolves to { data, error } via the chain's mockResolvedValue.
          // The chain mock returns itself for chaining, then the final call
          // returns the resolved value. Since there's no terminal call (single/maybeSingle),
          // the chain itself is returned. The code checks `existing && existing.length > 0`.
          // We need the chain to resolve with data having length > 0.
          const mock = chainMock({ data: [{ id: 'existing-progress' }], error: null })
          return mock
        }
        return chainMock({ data: null, error: null })
      })

      const caller = createCallerFactory(adminRouter)(makeAdminCtx(fromImpl))
      await expect(
        caller.assignPathway({
          practitionerId: PRACTITIONER_ID,
          pathwayId: PATHWAY_ID,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
  })
})
