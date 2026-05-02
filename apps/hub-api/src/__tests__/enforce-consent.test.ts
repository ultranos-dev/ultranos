import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsentScope, ConsentStatus } from '@ultranos/shared-types'

// Mock Supabase before importing
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
}

const { checkConsent, enforceConsentMiddleware } = await import(
  '../trpc/middleware/enforceConsent'
)

const PATIENT_ID = 'patient-001'
const TEST_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1' }

function mockSupabaseConsents(consents: Array<{ id: string; status: string; category: string[]; date_time?: string; provision_end?: string | null }>) {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        order: vi.fn().mockResolvedValue({
          data: consents,
          error: null,
        }),
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: consents,
            error: null,
          }),
        }),
      })),
    }),
  })
}

function mockSupabaseError() {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'UNKNOWN', message: 'DB error' },
        }),
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'UNKNOWN', message: 'DB error' },
          }),
        }),
      })),
    }),
  })
}

describe('checkConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when active consent exists for the required scope', async () => {
    const from = mockSupabaseConsents([
      { id: 'c1', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS] },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(true)
  })

  it('returns true when FULL_RECORD consent covers any resource type', async () => {
    const from = mockSupabaseConsents([
      { id: 'c2', status: ConsentStatus.ACTIVE, category: [ConsentScope.FULL_RECORD] },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(true)
  })

  it('returns false when no consent exists (Privacy by Design)', async () => {
    const from = mockSupabaseConsents([])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(false)
  })

  it('returns false when consent exists but for wrong scope', async () => {
    const from = mockSupabaseConsents([
      { id: 'c3', status: ConsentStatus.ACTIVE, category: [ConsentScope.VITALS] },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(false)
  })

  it('returns false on database error (fail-closed)', async () => {
    const from = mockSupabaseError()
    const supabase = { from } as never
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })

  it('returns false for unknown resource types', async () => {
    const from = mockSupabaseConsents([])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'UnknownResource',
    })

    expect(result).toBe(false)
  })

  it('maps Patient resource type to FULL_RECORD scope', async () => {
    const from = mockSupabaseConsents([
      { id: 'c4', status: ConsentStatus.ACTIVE, category: [ConsentScope.FULL_RECORD] },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'Patient',
    })

    expect(result).toBe(true)
  })

  it('returns false when consent is active but provision_end is in the past (expired)', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString() // 1 day ago
    const from = mockSupabaseConsents([
      { id: 'c-expired', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS], provision_end: pastDate },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(false)
  })

  it('returns true when consent is active and provision_end is in the future', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString() // 30 days from now
    const from = mockSupabaseConsents([
      { id: 'c-valid', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS], provision_end: futureDate },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(true)
  })

  it('returns true when consent is active and provision_end is null (indefinite)', async () => {
    const from = mockSupabaseConsents([
      { id: 'c-indef', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS], provision_end: null },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'MedicationRequest',
    })

    expect(result).toBe(true)
  })

  it('maps Encounter resource type to CLINICAL_NOTES scope', async () => {
    const from = mockSupabaseConsents([
      { id: 'c5', status: ConsentStatus.ACTIVE, category: [ConsentScope.CLINICAL_NOTES] },
    ])
    const supabase = { from } as never

    const result = await checkConsent(supabase, {
      patientId: PATIENT_ID,
      resourceType: 'Encounter',
    })

    expect(result).toBe(true)
  })
})

describe('enforceConsentMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls next when consent exists', async () => {
    const from = mockSupabaseConsents([
      { id: 'c1', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS] },
    ])
    const middleware = enforceConsentMiddleware('MedicationRequest')
    const next = vi.fn().mockResolvedValue({ result: 'ok' })

    await middleware({
      ctx: { supabase: { from } as never, user: TEST_USER },
      input: { patientId: PATIENT_ID },
      next,
    })

    expect(next).toHaveBeenCalled()
  })

  it('throws FORBIDDEN when no consent exists', async () => {
    const from = mockSupabaseConsents([])
    const middleware = enforceConsentMiddleware('MedicationRequest')
    const next = vi.fn()

    await expect(
      middleware({
        ctx: { supabase: { from } as never, user: TEST_USER },
        input: { patientId: PATIENT_ID },
        next,
      }),
    ).rejects.toThrow(/no active consent/)

    expect(next).not.toHaveBeenCalled()
  })

  it('extracts patientId from patientRef format', async () => {
    const from = mockSupabaseConsents([
      { id: 'c1', status: ConsentStatus.ACTIVE, category: [ConsentScope.PRESCRIPTIONS] },
    ])
    const middleware = enforceConsentMiddleware('MedicationRequest')
    const next = vi.fn().mockResolvedValue({ result: 'ok' })

    await middleware({
      ctx: { supabase: { from } as never, user: TEST_USER },
      input: { patientRef: `Patient/${PATIENT_ID}` },
      next,
    })

    expect(next).toHaveBeenCalled()
  })

  it('throws BAD_REQUEST when no patient identifier provided', async () => {
    const from = mockSupabaseConsents([])
    const middleware = enforceConsentMiddleware('MedicationRequest')
    const next = vi.fn()

    await expect(
      middleware({
        ctx: { supabase: { from } as never, user: TEST_USER },
        input: {},
        next,
      }),
    ).rejects.toThrow(/Patient identifier is required/)

    expect(next).not.toHaveBeenCalled()
  })
})
