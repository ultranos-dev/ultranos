import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 58.1 / audit C-SYS-4 — Patient photo privacy on lab-facing surfaces.
 *
 * Guarantees:
 *  - lab.pullOrders (list tier) NEVER returns a patient photo, and its serialized
 *    output contains neither a `<uuid>.webp` key nor the raw patient UUID.
 *  - lab.getOrderPatientDetails / lab.verifyPatient (detail/verification tier) MAY
 *    return a signed photo URL, but the URL path carries only the OPAQUE storage key
 *    (patients.photo_url), never the patient UUID — so the blind index is preserved.
 *  - opaquePhotoKey() never derives the key from a patient id.
 */

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((input: string) => `hmac-${input}`),
  encryptField: vi.fn((input: string) => `enc-${input}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

// UUIDs chosen so a leak would be unmistakable in serialized output.
const ORDER_ID = '11111111-1111-1111-1111-111111111111'
const PATIENT_ID = '22222222-2222-2222-2222-222222222222'
// The OPAQUE storage key persisted in patients.photo_url — deliberately unrelated to PATIENT_ID.
const OPAQUE_KEY = '99999999-9999-4999-8999-999999999999.webp'

// ── verifyPatient / getOrderPatientDetails harness (fine-grained per-table mocks) ──
const mockTechSingle = vi.fn()
const mockTechSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) }))

// verifyPatient patients lookup: .select().eq().single()
const verifyPatSingle = vi.fn()
const verifyPatSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: verifyPatSingle })) }))

// getOrderPatientDetails: service_requests .select().eq().maybeSingle()
const srMaybeSingle = vi.fn()
const srSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: srMaybeSingle })) }))
// getOrderPatientDetails: patients .select().eq().maybeSingle()
const detailPatMaybeSingle = vi.fn()
const detailPatSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: detailPatMaybeSingle })) }))
// observations .select().eq().order().limit()
const obsLimit = vi.fn()
const obsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: obsLimit })) })) }))

// Which patients-select variant to serve (verify uses .single, detail uses .maybeSingle).
let patientsMode: 'verify' | 'detail' = 'verify'

// Signed-URL storage stub: echoes the requested key into the URL path, so the test can
// assert the URL is derived from the OPAQUE key and never contains the patient UUID.
const signSpy = vi.fn((key: string) =>
  Promise.resolve({ data: { signedUrl: `https://storage.example/patient-photos/${key}?token=sig` } }),
)
const storage = {
  from: vi.fn(() => ({
    createSignedUrl: (path: string) => signSpy(path),
    createSignedUrls: (paths: string[]) =>
      Promise.resolve({
        data: paths.map((p) => ({ path: p, signedUrl: `https://storage.example/patient-photos/${p}?token=sig`, error: null })),
      }),
  })),
}

// enforceVerifiedOrg(): organizations.select('status').eq('id').single()
function mockOrganizationsTable() {
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }) })) })),
  }
}
// enforceEntitlement('LAB_LITE'): org_subscriptions.select().eq().eq().in().{maybeSingle|limit}
function mockOrgSubscriptionsTable() {
  const active = { data: { id: 'sub-1', status: 'ACTIVE' }, error: null }
  const activeList = { data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue(active),
            limit: vi.fn().mockResolvedValue(activeList),
          })),
        })),
      })),
    })),
  }
}

// Story 58.4 (H-HUB-7): verifyPatient / getOrderPatientDetails check consent in-body.
// ACTIVE FULL_RECORD grant keeps the photo-privacy behavior byte-identical.
function mockConsentsTable() {
  const rows = [{ id: 'consent-1', status: 'ACTIVE', category: ['FULL_RECORD'], date_time: '2026-01-01T00:00:00.000Z', provision_end: null }]
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) })) })) }
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return { select: mockTechSelect }
  if (table === 'organizations') return mockOrganizationsTable()
  if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
  if (table === 'consents') return mockConsentsTable()
  if (table === 'service_requests') return { select: srSelect }
  if (table === 'observations') return { select: obsSelect }
  if (table === 'patients') return { select: patientsMode === 'verify' ? verifyPatSelect : detailPatSelect }
  return { select: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom, storage })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')
const { opaquePhotoKey } = await import('../lib/photo-urls')

function makeCtx() {
  return {
    supabase: { from: mockFrom, storage } as never,
    user: { sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  }
}
function setupLab(status = 'ACTIVE') {
  mockTechSingle.mockResolvedValue({
    data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'tech-1', labs: { id: 'lab-1', status } },
    error: null,
  })
}

describe('opaquePhotoKey()', () => {
  it('produces a random <uuid>.webp key not derived from any patient id', () => {
    const a = opaquePhotoKey()
    const b = opaquePhotoKey()
    expect(a).toMatch(/^[0-9a-f-]{36}\.webp$/i)
    expect(a).not.toBe(b) // fresh per call
    expect(a).not.toContain(PATIENT_ID)
  })
})

describe('lab.getOrderPatientDetails photo privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patientsMode = 'detail'
  })

  it('signs the OPAQUE photo_url; URL contains the opaque key, never the patient UUID', async () => {
    setupLab()
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'lab-1' }, error: null })
    detailPatMaybeSingle.mockResolvedValue({
      data: { name_given: 'A', name_father: 'B', name_grandfather: 'C', blood_group: 'O+', photo_url: OPAQUE_KEY },
      error: null,
    })
    obsLimit.mockResolvedValue({ data: [], error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const res = await createCallerFactory(router)(makeCtx()).lab.getOrderPatientDetails({ orderId: ORDER_ID })

    // The helper was asked to sign the STORED opaque key, not a UUID-derived key.
    expect(signSpy).toHaveBeenCalledWith(OPAQUE_KEY)
    expect(signSpy).not.toHaveBeenCalledWith(`${PATIENT_ID}.webp`)

    // The signed photo URL itself must carry only the opaque key.
    expect(res.photoUrl).toContain(OPAQUE_KEY)
    expect(res.photoUrl).not.toContain(PATIENT_ID)

    // No lab-facing UUID leak: neither a UUID-derived photo key nor the raw UUID as a
    // standalone value. (patientRef is the blind index; under the test's crypto mock it
    // is `hmac-<uuid>`, so we assert the UUID never appears as a quoted standalone value.)
    const json = JSON.stringify(res)
    expect(json).not.toContain(`${PATIENT_ID}.webp`)
    expect(json).not.toContain(`"${PATIENT_ID}"`)
  })

  it('returns a null photo when the patient has none, without touching storage', async () => {
    setupLab()
    // Claim-before-details (Story 58.2): the order must be claimed by this lab.
    srMaybeSingle.mockResolvedValue({ data: { id: ORDER_ID, patient_id: PATIENT_ID, received_by_lab_id: 'lab-1' }, error: null })
    detailPatMaybeSingle.mockResolvedValue({ data: { name_given: 'A', name_father: 'B', name_grandfather: 'C', blood_group: 'O+', photo_url: null }, error: null })
    obsLimit.mockResolvedValue({ data: [], error: null })

    const router = createTRPCRouter({ lab: labRouter })
    const res = await createCallerFactory(router)(makeCtx()).lab.getOrderPatientDetails({ orderId: ORDER_ID })

    expect(res.photoUrl).toBeNull()
    expect(signSpy).not.toHaveBeenCalled()
  })
})

describe('lab.verifyPatient photo privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patientsMode = 'verify'
  })

  it('signs the OPAQUE photo_url; URL contains the opaque key, never the patient UUID', async () => {
    setupLab()
    verifyPatSingle.mockResolvedValue({
      data: { id: PATIENT_ID, name_given: 'Amir', birth_date: '1990-05-15', birth_year: 1990, photo_url: OPAQUE_KEY },
      error: null,
    })

    const router = createTRPCRouter({ lab: labRouter })
    const res = await createCallerFactory(router)(makeCtx()).lab.verifyPatient({ query: 'NID-1', method: 'NATIONAL_ID' })

    expect(signSpy).toHaveBeenCalledWith(OPAQUE_KEY)
    expect(signSpy).not.toHaveBeenCalledWith(`${PATIENT_ID}.webp`)

    expect(res.photoUrl).toContain(OPAQUE_KEY)
    expect(res.photoUrl).not.toContain(PATIENT_ID)

    // patientRef is the blind index (mocked as hmac-<uuid>); the raw UUID must not
    // appear as a standalone value, nor may a UUID-derived photo key.
    const json = JSON.stringify(res)
    expect(json).not.toContain(`${PATIENT_ID}.webp`)
    expect(json).not.toContain(`"${PATIENT_ID}"`)
  })
})

// ── pullOrders harness (chainable builder; thenable resolves to the row array) ──
describe('lab.pullOrders photo privacy (list tier)', () => {
  function buildPullFrom(patientHasPhoto: boolean) {
    function createBuilder(data: any) {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        or: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        gt: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data, error: null })),
        then: (resolve: any) => resolve({ data: data ? [data] : [], error: null }),
      }
      return builder
    }
    return (table: string) => {
      // Story 58.4 (M-HUB-14): pullOrders now runs enforceVerifiedOrg +
      // enforceEntitlement('LAB_LITE') — verified org + ACTIVE subscription.
      if (table === 'organizations') {
        return createBuilder({ id: 'org-1', status: 'TRIAL', cancelled_at: null })
      }
      if (table === 'org_subscriptions') {
        return createBuilder({ id: 'sub-1', status: 'ACTIVE' })
      }
      if (table === 'lab_technicians') {
        return createBuilder({ id: 'tech-rec', lab_id: 'lab-1', lab_role: 'LAB_TECH', labs: { id: 'lab-1', status: 'ACTIVE' } })
      }
      if (table === 'service_requests') {
        return createBuilder({
          id: ORDER_ID,
          status: 'active',
          priority: 'stat',
          code_code: '58410-2',
          code_display: 'CBC',
          patient_id: PATIENT_ID,
          requester_id: 'doctor-1',
          authored_on: '2026-05-30T10:00:00.000Z',
          special_instructions: null,
          meta_last_updated: '2026-05-30T10:00:00.000Z',
          received_by_lab_id: 'lab-1',
          // Even if the patient HAS a photo, pullOrders must not surface it. (photo_url is no
          // longer even selected — included here only to prove it never leaks downstream.)
          patients: { id: PATIENT_ID, name_given: 'Ahmad', birth_date: null, birth_year: 1991, ...(patientHasPhoto ? { photo_url: OPAQUE_KEY } : {}) },
          practitioners: { id: 'doctor-1', given_name: 'Dr.', family_name: 'Karimi' },
        })
      }
      return createBuilder(null)
    }
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('never returns patientPhotoUrl and leaks no photo key or patient UUID', async () => {
    const pullFrom = buildPullFrom(true)
    const router = createTRPCRouter({ lab: labRouter })
    const caller = createCallerFactory(router)({
      supabase: { from: pullFrom, storage } as never,
      user: { sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
      headers: new Headers(),
    } as never)

    const res = await caller.lab.pullOrders({ limit: 100 })
    const order = res.orders[0]!

    expect(order).not.toHaveProperty('patientPhotoUrl')
    // No photo was signed for the list tier at all.
    expect(signSpy).not.toHaveBeenCalled()

    const json = JSON.stringify(res)
    expect(json).not.toContain('.webp')
    expect(json).not.toContain(OPAQUE_KEY)
    // patientRef is the blind index (Patient/hmac-<uuid>); the raw UUID must not appear.
    expect(json).not.toContain(`"${PATIENT_ID}"`)
    expect(json).not.toContain(`${PATIENT_ID}.webp`)
  })
})
