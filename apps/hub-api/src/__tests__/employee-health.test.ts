import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

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

// Mock crypto/server for encryption tests
const mockEncryptField = vi.fn((plaintext: string) => `v1:encrypted:${plaintext}`)
const mockDecryptField = vi.fn((ciphertext: string) => {
  if (ciphertext.startsWith('v1:encrypted:')) return ciphertext.slice('v1:encrypted:'.length)
  return '[Encrypted Content]'
})

vi.mock('@ultranos/crypto/server', () => ({
  encryptField: (...args: any[]) => mockEncryptField(...args),
  decryptField: (...args: any[]) => mockDecryptField(...args),
  getEncryptionConfig: () => ({ randomizedFields: [] }),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ================================================================
// Supabase mock builder
// ================================================================

interface MockChain {
  from: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function createMockSupabase() {
  const single = vi.fn().mockResolvedValue({ data: null, error: null })
  const eq = vi.fn()
  eq.mockReturnValue({ single, eq })
  const select = vi.fn().mockReturnValue({ eq, single })
  const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'rec-1' }, error: null }) }) })
  const from = vi.fn().mockReturnValue({ select, upsert })
  return { from, select, upsert, eq, single }
}

function makeAdminCtx(mock: ReturnType<typeof createMockSupabase>) {
  return {
    supabase: { from: mock.from } as never,
    user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

function makeDoctorCtx(mock: ReturnType<typeof createMockSupabase>) {
  return {
    supabase: { from: mock.from } as never,
    user: { sub: 'doc-1', role: 'DOCTOR', sessionId: 's1', orgId: null, status: null },
    headers: new Headers(),
  }
}

const PRACTITIONER_ID = '00000000-0000-0000-0000-000000000001'

const SAMPLE_RECORD = {
  id: 'rec-1',
  practitioner_id: PRACTITIONER_ID,
  hep_b_status: 'COMPLETE',
  hep_b_titer_date: '2025-06-15',
  tetanus_status: 'IN_PROGRESS',
  tetanus_date: '2025-03-10',
  covid_status: 'COMPLETE',
  covid_doses: 3,
  covid_last_dose_date: '2025-01-20',
  tb_screening_date: '2025-08-01',
  tb_screening_result: 'NEGATIVE',
  exposure_history_encrypted: 'v1:encrypted:' + JSON.stringify([
    { date: '2025-02-01', type: 'Needlestick', outcome: 'No seroconversion' },
  ]),
  created_at: '2025-06-01T00:00:00Z',
  updated_at: '2025-08-01T00:00:00Z',
}

describe('admin.getEmployeeHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns decrypted exposure history for existing record', async () => {
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: SAMPLE_RECORD, error: null })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    const result = await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(result).not.toBeNull()
    expect(result!.exposureHistory).toEqual([
      { date: '2025-02-01', type: 'Needlestick', outcome: 'No seroconversion' },
    ])
    expect(mockDecryptField).toHaveBeenCalled()
  })

  it('emits READ audit event with SUCCESS outcome', async () => {
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: SAMPLE_RECORD, error: null })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'EMPLOYEE_HEALTH',
        resourceId: PRACTITIONER_ID,
        actorId: 'admin-1',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('emits NOT_FOUND audit outcome when record does not exist', async () => {
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'NOT_FOUND',
      }),
    )
  })

  it('returns null when no record exists', async () => {
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    const result = await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(result).toBeNull()
  })

  it('returns decryptionFailed flag when decryption throws', async () => {
    mockDecryptField.mockImplementationOnce(() => { throw new Error('bad key') })
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: SAMPLE_RECORD, error: null })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    const result = await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(result).not.toBeNull()
    expect(result!.decryptionFailed).toBe(true)
    expect(result!.exposureHistory).toEqual([])
  })

  it('computes screening reminders', async () => {
    const mock = createMockSupabase()
    mock.single.mockResolvedValue({ data: SAMPLE_RECORD, error: null })

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))
    const result = await caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID })

    expect(result!.reminders).toBeDefined()
    expect(result!.reminders.tbScreening.status).toBeDefined()
  })

  it('rejects non-ADMIN callers with FORBIDDEN', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeDoctorCtx(mock))

    await expect(
      caller.getEmployeeHealth({ practitionerId: PRACTITIONER_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('admin.updateEmployeeHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts exposure history before storing', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))

    await caller.updateEmployeeHealth({
      practitionerId: PRACTITIONER_ID,
      hepBStatus: 'COMPLETE',
      tetanusStatus: 'NOT_STARTED',
      covidStatus: 'IN_PROGRESS',
      covidDoses: 2,
      exposureHistory: [{ date: '2025-03-01', type: 'Splash', outcome: 'Monitored' }],
    })

    expect(mockEncryptField).toHaveBeenCalledWith(
      JSON.stringify([{ date: '2025-03-01', type: 'Splash', outcome: 'Monitored' }]),
      expect.any(String),
    )
  })

  it('emits UPDATE audit event with only submitted optional fields in changedFields', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))

    await caller.updateEmployeeHealth({
      practitionerId: PRACTITIONER_ID,
      hepBStatus: 'COMPLETE',
      tetanusStatus: 'NOT_STARTED',
      covidStatus: 'NOT_STARTED',
      covidDoses: 0,
      tbScreeningDate: '2026-01-15',
    })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'EMPLOYEE_HEALTH',
        resourceId: PRACTITIONER_ID,
        metadata: expect.objectContaining({
          changedFields: expect.arrayContaining(['hepBStatus', 'tbScreeningDate']),
        }),
      }),
    )
    // Optional fields not supplied should not appear
    const call = mockAuditEmit.mock.calls[0][0]
    expect(call.metadata.changedFields).not.toContain('hepBTiterDate')
    expect(call.metadata.changedFields).not.toContain('tetanusDate')
  })

  it('rejects invalid date string for tbScreeningDate', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))

    await expect(
      caller.updateEmployeeHealth({
        practitionerId: PRACTITIONER_ID,
        hepBStatus: 'NOT_STARTED',
        tetanusStatus: 'NOT_STARTED',
        covidStatus: 'NOT_STARTED',
        covidDoses: 0,
        tbScreeningDate: 'not-a-date',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects exposure history entry with type exceeding 200 chars', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(mock))

    await expect(
      caller.updateEmployeeHealth({
        practitionerId: PRACTITIONER_ID,
        hepBStatus: 'NOT_STARTED',
        tetanusStatus: 'NOT_STARTED',
        covidStatus: 'NOT_STARTED',
        covidDoses: 0,
        exposureHistory: [{ date: '2026-01-01', type: 'x'.repeat(201), outcome: 'fine' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects non-ADMIN callers with FORBIDDEN', async () => {
    const mock = createMockSupabase()
    const caller = createCallerFactory(adminRouter)(makeDoctorCtx(mock))

    await expect(
      caller.updateEmployeeHealth({
        practitionerId: PRACTITIONER_ID,
        hepBStatus: 'NOT_STARTED',
        tetanusStatus: 'NOT_STARTED',
        covidStatus: 'NOT_STARTED',
        covidDoses: 0,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
