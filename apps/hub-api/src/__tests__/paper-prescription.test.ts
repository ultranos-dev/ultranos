import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client before importing the router
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
  storage: {
    from: vi.fn(),
  },
}

// Must import after mock setup
const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

const TEST_PHARMACIST = { sub: 'pharmacist-001', role: 'PHARMACIST', sessionId: 'sess-1', orgId: 'org-test-001' }
const TEST_DOCTOR = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-2', orgId: 'org-test-001' }

function entitlementMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sub-1', status: 'ACTIVE' },
              error: null,
            }),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'sub-1', status: 'ACTIVE' }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }
}

function mockOrganizationsTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }),
      }),
    }),
  }
}

function auditLogMock() {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

function createTestContext(overrides?: {
  supabaseFrom?: ReturnType<typeof vi.fn>
  storageMock?: any
  user?: { sub: string; role: string; sessionId: string; orgId?: string } | null
}) {
  const supabase = {
    from: overrides?.supabaseFrom ?? vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'abc123' }], error: null }),
    storage: overrides?.storageMock ?? mockSupabaseClient.storage,
  }
  return {
    supabase: supabase as never,
    user: overrides?.user ?? null,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('medication.createPaperPrescription (Story 24.3)', () => {
  const validInput = {
    medicationName: 'Amoxicillin 500mg',
    dosage: '500mg',
    frequency: 'twice daily',
    prescriberName: 'Dr. Ahmed',
    prescriptionDate: '2026-05-15',
    ocrConfidenceScores: { medicationName: 0.92, dosage: 0.78 },
    imageStorageKey: 'pharmacist-001/abc-123',
  }

  it('creates paper prescription with source PAPER_OCR and LEGACY_PAPER status', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'medication_requests') {
        return { insert: insertMock }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)
    const result = await caller.medication.createPaperPrescription(validInput)

    expect(result.success).toBe(true)
    expect(result.status).toBe('LEGACY_PAPER')
    expect(result.prescriptionId).toBeDefined()

    // Verify the inserted row has correct fields
    const insertedRow = insertMock.mock.calls[0][0]
    expect(insertedRow.source).toBe('PAPER_OCR')
    expect(insertedRow.prescriptionStatus).toBe('LEGACY_PAPER')
    expect(insertedRow.manualVerificationRequired).toBe(true)
    expect(insertedRow.qrCodeId).toBeNull()
    expect(insertedRow.interactionCheck).toBeNull()
    expect(insertedRow.ocrMetadata.confidenceScores).toEqual(validInput.ocrConfidenceScores)
  })

  it('emits PAPER_PRESCRIPTION_CREATED audit event via rpc', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ chain_hash: 'abc123' }],
      error: null,
    })

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'medication_requests') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const supabase = {
      from: mockFrom,
      rpc: rpcMock,
      storage: mockSupabaseClient.storage,
    }
    const ctx = {
      supabase: supabase as never,
      user: TEST_PHARMACIST,
      headers: new Headers(),
    }
    const caller = createCaller(ctx)
    await caller.medication.createPaperPrescription(validInput)

    // AuditLogger uses rpc('audit_emit_with_lock') for hash-chained insert
    expect(rpcMock).toHaveBeenCalledWith('audit_emit_with_lock', expect.objectContaining({
      p_action: 'PAPER_PRESCRIPTION_CREATED',
      p_resource_type: 'PRESCRIPTION',
      p_actor_id: TEST_PHARMACIST.sub,
      p_metadata: expect.objectContaining({
        source: 'PAPER_OCR',
      }),
    }))
  })

  it('allows optional patientId', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'medication_requests') {
        return { insert: insertMock }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)
    const result = await caller.medication.createPaperPrescription(validInput)

    expect(result.success).toBe(true)
    const insertedRow = insertMock.mock.calls[0][0]
    expect(insertedRow.subjectReference).toBeNull()
  })
})

describe('medication.invalidate (Story 24.3)', () => {
  const RX_UUID = '00000000-0000-4000-8000-000000000099'

  it('rejects LEGACY_PAPER prescriptions with PRECONDITION_FAILED', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: RX_UUID, prescription_status: 'LEGACY_PAPER', subject_reference: 'Patient/p1' },
                error: null,
              }),
            }),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.invalidate({ prescriptionId: RX_UUID }),
    ).rejects.toThrow('Paper prescriptions cannot be digitally invalidated')
  })

  it('allows invalidation of ACTIVE prescriptions', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      if (table === 'audit_log') return auditLogMock()
      if (table === 'medication_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: RX_UUID, prescription_status: 'ACTIVE', subject_reference: 'Patient/p1' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: RX_UUID, prescription_status: 'CANCELLED' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)
    const result = await caller.medication.invalidate({ prescriptionId: RX_UUID })

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('VOIDED')
  })
})

describe('medication.getPaperRxUploadUrl (Story 24.3)', () => {
  it('generates a signed upload URL for paper-prescriptions bucket', async () => {
    const createSignedUploadUrlMock = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/upload?token=abc' },
      error: null,
    })

    const storageMock = {
      from: vi.fn().mockReturnValue({
        createSignedUploadUrl: createSignedUploadUrlMock,
      }),
    }

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, storageMock, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)
    const result = await caller.medication.getPaperRxUploadUrl({ contentType: 'image/jpeg' })

    expect(result.uploadUrl).toBe('https://storage.example.com/upload?token=abc')
    expect(result.storageKey).toContain('pharmacist-001/')
    expect(result.expiresAt).toBeDefined()

    // Verify bucket name
    expect(storageMock.from).toHaveBeenCalledWith('paper-prescriptions')
    // Verify 15-minute expiry
    expect(createSignedUploadUrlMock.mock.calls[0][1]).toEqual({ expiresIn: 900 })
  })

  it('rejects invalid content types', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return entitlementMock()
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const ctx = createTestContext({ supabaseFrom: mockFrom, user: TEST_PHARMACIST })
    const caller = createCaller(ctx)

    await expect(
      caller.medication.getPaperRxUploadUrl({ contentType: 'application/pdf' as any }),
    ).rejects.toThrow()
  })
})
