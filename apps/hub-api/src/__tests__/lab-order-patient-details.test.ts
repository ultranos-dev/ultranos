import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const ORDER_ID = '11111111-1111-1111-1111-111111111111'
const PATIENT_ID = '22222222-2222-2222-2222-222222222222'

// lab_technicians (labRestrictedProcedure)
const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))

// service_requests → order lookup
const srMaybeSingle = vi.fn()
const srSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: srMaybeSingle })) }))

// patients → identity
const patMaybeSingle = vi.fn()
const patSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: patMaybeSingle })) }))

// observations → latest vitals
const obsLimit = vi.fn()
const obsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: obsLimit })) })) }))

// Story 58.4: middleware stack now unified (enforceVerifiedOrg + enforceEntitlement)
// and consent is checked in-body. Default to a verified org + ACTIVE entitlement +
// ACTIVE FULL_RECORD consent so the pre-existing tests stay byte-identical.
const consentActive = { value: true }
function mockOrganizationsTable() {
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }) })) })) }
}
function mockOrgSubscriptionsTable() {
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({
      in: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
        limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
      })),
    })) })) })),
  }
}
function mockConsentsTable() {
  const rows = [{
    id: 'consent-1',
    status: consentActive.value ? 'ACTIVE' : 'WITHDRAWN',
    category: ['FULL_RECORD'],
    date_time: '2026-01-01T00:00:00.000Z',
    provision_end: null,
  }]
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) })) })) }
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'organizations') return mockOrganizationsTable()
  if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
  if (table === 'consents') return mockConsentsTable()
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'service_requests') return { select: srSelect }
  if (table === 'patients') return { select: patSelect }
  if (table === 'observations') return { select: obsSelect }
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCtx(user: { sub: string; practitionerId?: string; role: `${import('@ultranos/shared-types').UserRole}`; sessionId: string; orgId: string | null; facilityId: string | null; status: string | null } | null) {
  return { supabase: { from: mockFrom } as never, user, headers: new Headers() }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}

const VITALS = [
  {
    code: { coding: [{ code: '85354-9' }] },
    value_quantity: null,
    component: [
      { code: { coding: [{ code: '8480-6' }] }, value_quantity: { value: 101 } },
      { code: { coding: [{ code: '8462-4' }] }, value_quantity: { value: 77 } },
    ],
    effective_date_time: '2026-09-10T21:04:34Z',
  },
  { code: { coding: [{ code: '39156-5' }] }, value_quantity: { value: 26.6 }, component: null, effective_date_time: '2026-09-10T21:04:34Z' },
  { code: { coding: [{ code: '29463-7' }] }, value_quantity: { value: 77 }, component: null, effective_date_time: '2026-09-10T21:04:34Z' },
  { code: { coding: [{ code: '8310-5' }] }, value_quantity: { value: 37 }, component: null, effective_date_time: '2026-09-10T21:04:34Z' },
  { code: { coding: [{ code: '8302-2' }] }, value_quantity: { value: 170 }, component: null, effective_date_time: '2026-09-10T21:04:34Z' },
]

describe('lab.getOrderPatientDetails', () => {
  beforeEach(() => { vi.clearAllMocks(); consentActive.value = true })

  // ── Story 58.4 (H-HUB-7): consent gating ────────────────────
  it('denies on withdrawn consent (FORBIDDEN) and does NOT read patient/vitals', async () => {
    setupLab()
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'lab-1' }, error: null })
    consentActive.value = false

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // No PHI fetched once consent is denied.
    expect(patMaybeSingle).not.toHaveBeenCalled()
    // Denial audited (FAILURE outcome).
    const denialCall = mockAuditEmit.mock.calls.find((c) => c[0]?.outcome === 'FAILURE')
    expect(denialCall?.[0]).toMatchObject({ action: 'READ', resourceType: 'PATIENT', outcome: 'FAILURE' })
  })

  it('returns full name + gender + blood group + latest vitals for a claimed order', async () => {
    setupLab()
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'lab-1' }, error: null })
    patMaybeSingle.mockResolvedValue({
      data: { name_given: 'احمد منگل', name_father: 'مرجان خان', name_grandfather: 'قمرجان', gender: 'male', blood_group: 'A+' },
      error: null,
    })
    obsLimit.mockResolvedValue({ data: VITALS, error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    const res = await caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })

    expect(res.fullName).toEqual({ given: 'احمد منگل', father: 'مرجان خان', grandfather: 'قمرجان' })
    // Gender is in the sanctioned detail tier (Story 58.2) for sex-specific ranges.
    expect(res.gender).toBe('male')
    expect(res.bloodGroup).toBe('A+')
    expect(res.vitals).toMatchObject({
      weightKg: 77,
      heightCm: 170,
      bmi: 26.6,
      temperatureC: 37,
      bpSystolic: 101,
      bpDiastolic: 77,
    })
    // PHI read is audited (Rule #6)
    expect(mockAuditEmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'READ', resourceType: 'PATIENT' }))
  })

  it('does not expose National ID or the raw patient UUID in the response', async () => {
    setupLab()
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'lab-1' }, error: null })
    patMaybeSingle.mockResolvedValue({ data: { name_given: 'A', name_father: 'B', name_grandfather: 'C', gender: 'female', blood_group: 'O+' }, error: null })
    obsLimit.mockResolvedValue({ data: [], error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    const res = await caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })
    const json = JSON.stringify(res)
    expect(json).not.toContain(PATIENT_ID)
    expect(json).not.toContain('national')
    expect(res.vitals.weightKg).toBeNull() // no vitals on record → nulls, not an error
  })

  it('rejects an order assigned to a different lab', async () => {
    setupLab()
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'other-lab' }, error: null })
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects an UNCLAIMED order — claim-before-details (Story 58.2 / H-HUB-4)', async () => {
    setupLab()
    // received_by_lab_id IS NULL → broadcast order, appears in pullOrders at the LIST
    // tier only. Detail-tier PHI must NOT be readable until the lab claims it.
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: null }, error: null })
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects non-LAB_TECH roles', async () => {
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)(makeCtx({ sub: 'doc-1', role: 'DOCTOR' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }))
    await expect(caller.lab.getOrderPatientDetails({ orderId: ORDER_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
