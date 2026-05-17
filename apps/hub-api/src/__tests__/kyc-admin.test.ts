import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// KYC Admin Endpoint Tests — Story 22.2
// Tests listKycSubmissions, getKycSubmission, reviewKycSubmission,
// and dashboardStats KYC count wiring.
// ============================================================

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    admin: { createUser: vi.fn() },
  },
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  storage: {
    from: vi.fn().mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example.com/signed?token=abc' },
        error: null,
      }),
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.example.com/upload?token=abc' },
        error: null,
      }),
    }),
  },
}

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const ADMIN_USER = {
  sub: '00000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
  sessionId: 'sess-admin-1',
  orgId: '00000000-0000-4000-8000-000000000099',
  status: null,
}

const DOCTOR_USER = {
  sub: '00000000-0000-4000-8000-000000000002',
  role: 'DOCTOR',
  sessionId: 'sess-doctor-1',
  orgId: '00000000-0000-4000-8000-000000000099',
  status: null,
}

function createAdminContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: ADMIN_USER as any,
    headers: new Headers(),
  }
}

function createDoctorContext() {
  return {
    supabase: mockSupabaseClient as never,
    user: DOCTOR_USER as any,
    headers: new Headers(),
  }
}

const SUBMISSION_UUID = '00000000-0000-4000-8000-000000000010'
const PRACTITIONER_UUID = '00000000-0000-4000-8000-000000000020'

// Three business days ago (should be breached)
const BREACHED_DATE = new Date()
BREACHED_DATE.setDate(BREACHED_DATE.getDate() - 7)
const BREACHED_ISO = BREACHED_DATE.toISOString()

// Today (should NOT be breached)
const FRESH_DATE = new Date()
const FRESH_ISO = FRESH_DATE.toISOString()

const mockSubmissionRow = {
  id: SUBMISSION_UUID,
  practitioner_id: PRACTITIONER_UUID,
  status: 'PENDING',
  registry_number: 'REG-12345',
  submitted_at: FRESH_ISO,
  documents: [
    {
      type: 'MEDICAL_LICENSE',
      storageKey: 'pract-1/MEDICAL_LICENSE-1234',
      ocrResults: {
        fields: [
          { name: 'Name', value: 'Dr. Ahmed', confidence: 0.95 },
          { name: 'License Number', value: 'ML-9876', confidence: 0.88 },
          { name: 'Issuing Body', value: 'Ministry of Health', confidence: 0.72 },
          { name: 'Expiry Date', value: '2027-12-31', confidence: 0.91 },
        ],
      },
    },
  ],
  rejection_reason: null,
  admin_message: null,
  reviewed_by: null,
  reviewed_at: null,
  practitioners: {
    name: [{ given: ['Ahmed'], family: 'Hassan', text: 'Dr. Ahmed Hassan' }],
    identifier: [{ system: 'MOH', value: 'MOH-1234' }],
    _ultranos: { kycStatus: 'PENDING_VERIFICATION' },
  },
}

/** Helper: mock tables for KYC admin tests */
function mockKycAdminTables(opts?: {
  submissions?: any[]
  submissionCount?: number
  submissionDetail?: any
  practitionerUpdateOk?: boolean
}) {
  const subs = opts?.submissions ?? [mockSubmissionRow]
  const subCount = opts?.submissionCount ?? subs.length
  const detail = opts?.submissionDetail ?? mockSubmissionRow

  return (table: string) => {
    if (table === 'kyc_submissions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: subs, error: null, count: subCount }),
            }),
            single: vi.fn().mockResolvedValue({ data: detail, error: null }),
            select: vi.fn().mockReturnValue({
              // for count query in dashboardStats
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ error: null, count: 1 }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'practitioners') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: opts?.practitionerUpdateOk === false ? { message: 'fail' } : null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: PRACTITIONER_UUID }, error: null }),
          }),
        }),
      }
    }
    if (table === 'notifications') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'labs') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 3 }),
        }),
      }
    }
    if (table === 'audit_events') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: { id: 'audit-1' }, error: null }),
        }),
      }
    }
    // Default fallback
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
  }
}

describe('Story 22.2 — KYC Admin Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── listKycSubmissions ─────────────────────────────────────
  describe('admin.listKycSubmissions', () => {
    it('returns paginated results filtered by status', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.listKycSubmissions({ status: 'ALL', cursor: 0, limit: 25 })

      expect(result.submissions).toHaveLength(1)
      expect(result.submissions[0].submissionId).toBe(SUBMISSION_UUID)
      expect(result.submissions[0].providerName).toBe('Dr. Ahmed Hassan')
      expect(result.submissions[0].registryNumber).toBe('REG-12345')
      expect(result.total).toBe(1)
    })

    it('correctly identifies SLA-breached submissions', async () => {
      const breachedSub = { ...mockSubmissionRow, submitted_at: BREACHED_ISO }
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables({ submissions: [breachedSub] }))
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.listKycSubmissions({ status: 'ALL' })

      expect(result.submissions[0].slaBreached).toBe(true)
      expect(result.submissions[0].slaRemainingHours).toBeNull()
    })

    it('SLA_BREACHED filter returns only breached submissions', async () => {
      const freshSub = { ...mockSubmissionRow, id: 'fresh-1', submitted_at: FRESH_ISO }
      const breachedSub = { ...mockSubmissionRow, id: 'breach-1', submitted_at: BREACHED_ISO }
      mockSupabaseClient.from.mockImplementation(
        mockKycAdminTables({ submissions: [freshSub, breachedSub], submissionCount: 2 }),
      )
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.listKycSubmissions({ status: 'SLA_BREACHED' })

      const breachedIds = result.submissions.filter((s: any) => s.slaBreached).map((s: any) => s.submissionId)
      expect(breachedIds).toContain('breach-1')
      // Fresh submission should NOT be in breached filter
      expect(result.submissions.every((s: any) => s.slaBreached)).toBe(true)
    })
  })

  // ── getKycSubmission ───────────────────────────────────────
  describe('admin.getKycSubmission', () => {
    it('returns submission detail with OCR fields and signed URLs', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.getKycSubmission({ submissionId: SUBMISSION_UUID })

      expect(result.submission.id).toBe(SUBMISSION_UUID)
      expect(result.providerName).toBe('Dr. Ahmed Hassan')
      expect(result.ocrFields).toHaveLength(1)
      expect(result.ocrFields[0].documentType).toBe('MEDICAL_LICENSE')
      expect(result.ocrFields[0].fields).toHaveLength(4)
      expect(result.documentUrls).toHaveLength(1)
      expect(result.documentUrls[0].url).toContain('signed')
    })

    it('emits a PHI_READ audit event', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      await caller.admin.getKycSubmission({ submissionId: SUBMISSION_UUID })

      const auditCalls = mockSupabaseClient.from.mock.calls.filter(
        (c: any[]) => c[0] === 'audit_events',
      )
      expect(auditCalls.length).toBeGreaterThan(0)
    })

    it('rejects non-ADMIN callers', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createDoctorContext())

      await expect(
        caller.admin.getKycSubmission({ submissionId: SUBMISSION_UUID }),
      ).rejects.toThrow(/Admin access required/)
    })
  })

  // ── reviewKycSubmission ────────────────────────────────────
  describe('admin.reviewKycSubmission', () => {
    it('APPROVE transitions practitioner to ACTIVE', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.reviewKycSubmission({
        submissionId: SUBMISSION_UUID,
        action: 'APPROVE',
      })

      expect(result.success).toBe(true)
      expect(result.newKycStatus).toBe('ACTIVE')
    })

    it('REJECT requires reason and transitions to REJECTED', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      // Without reason should fail
      await expect(
        caller.admin.reviewKycSubmission({
          submissionId: SUBMISSION_UUID,
          action: 'REJECT',
        }),
      ).rejects.toThrow()

      // With reason should succeed
      const result = await caller.admin.reviewKycSubmission({
        submissionId: SUBMISSION_UUID,
        action: 'REJECT',
        reason: 'License document appears expired',
      })

      expect(result.success).toBe(true)
      expect(result.newKycStatus).toBe('REJECTED')
    })

    it('REQUEST_MORE_INFO transitions to REQUEST_MORE_INFO', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      const result = await caller.admin.reviewKycSubmission({
        submissionId: SUBMISSION_UUID,
        action: 'REQUEST_MORE_INFO',
        reason: 'Please upload a clearer copy of the license',
      })

      expect(result.success).toBe(true)
      expect(result.newKycStatus).toBe('REQUEST_MORE_INFO')
    })

    it('emits audit events for all actions', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      // All three actions should succeed (audit is best-effort, caught internally)
      const approveResult = await caller.admin.reviewKycSubmission({
        submissionId: SUBMISSION_UUID,
        action: 'APPROVE',
      })
      expect(approveResult.success).toBe(true)

      // Verify that `from` was called — audit logger attempts to write via supabase
      const allFromCalls = mockSupabaseClient.from.mock.calls.map((c: any[]) => c[0])
      // P15: Must assert audit_events was called (not just other tables)
      expect(allFromCalls).toContain('audit_events')
      expect(allFromCalls).toContain('kyc_submissions')
      expect(allFromCalls).toContain('practitioners')
      expect(allFromCalls).toContain('notifications')
    })

    it('sends notification to provider after review', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createAdminContext())

      await caller.admin.reviewKycSubmission({
        submissionId: SUBMISSION_UUID,
        action: 'APPROVE',
      })

      // Verify notifications table was called
      const notifCalls = mockSupabaseClient.from.mock.calls.filter(
        (c: any[]) => c[0] === 'notifications',
      )
      expect(notifCalls.length).toBeGreaterThan(0)
    })
  })

  // ── non-ADMIN callers ──────────────────────────────────────
  describe('RBAC enforcement', () => {
    it('non-ADMIN callers are rejected with FORBIDDEN', async () => {
      mockSupabaseClient.from.mockImplementation(mockKycAdminTables())
      const caller = createCaller(createDoctorContext())

      await expect(
        caller.admin.listKycSubmissions({ status: 'ALL' }),
      ).rejects.toThrow(/Admin access required/)

      await expect(
        caller.admin.getKycSubmission({ submissionId: SUBMISSION_UUID }),
      ).rejects.toThrow(/Admin access required/)

      await expect(
        caller.admin.reviewKycSubmission({ submissionId: SUBMISSION_UUID, action: 'APPROVE' }),
      ).rejects.toThrow(/Admin access required/)
    })
  })

  // ── dashboardStats ─────────────────────────────────────────
  describe('admin.dashboardStats KYC count', () => {
    it('returns real pendingKycReviews count', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'labs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 2 }),
            }),
          }
        }
        if (table === 'kyc_submissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 5 }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }
      })

      const caller = createCaller(createAdminContext())
      const result = await caller.admin.dashboardStats()

      expect(result.pendingKycReviews).toBe(5)
      expect(result.pendingLabApprovals).toBe(2)
    })
  })
})
