import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 58.2 Task 5 — Data-minimization CONTRACT tests.
 *
 * These are allowlist tests: for each lab-facing procedure they assert the EXACT
 * set of top-level output keys the lab is permitted to receive. If a future change
 * adds ANY field to one of these DTOs (e.g. re-introduces gender/phone on a list
 * surface, or medication identity on monitoring), the corresponding test fails in
 * CI — the point is to make a data-minimization regression impossible to land
 * silently (audit §10 Theme 6: "enforced at the query, leaked at the edges").
 *
 * Procedures covered:
 *   - lab.pullOrders                    (order-list tier)
 *   - lab.verifyPatient                 (identity-verification tier)
 *   - lab.getOrderPatientDetails        (order-scoped detail tier)
 *   - lab.pullDispenseMonitoringEvents  (dispense-monitoring tier)
 */

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))
// Photo signing: return null so we never touch storage in the contract test.
vi.mock('@/lib/photo-urls', () => ({
  signPhotoUrl: vi.fn().mockResolvedValue(null),
  signPhotoUrls: vi.fn().mockResolvedValue({}),
}))

const LAB_ID = 'lab-1'
const PATIENT_UUID = '22222222-2222-2222-2222-222222222222'
const ORDER_ID = '11111111-1111-1111-1111-111111111111'

// ── Per-table mock builders ───────────────────────────────────
function labTechBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 'tech-rec', lab_id: LAB_ID, practitioner_id: 'tech-1', labs: { id: LAB_ID, status: 'ACTIVE' } },
          error: null,
        }),
      })),
    })),
  }
}

function orgBuilder() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }),
      }),
    }),
  }
}

function subBuilder() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }),
          }),
        }),
      }),
    }),
  }
}

// pullOrders: from('service_requests').select(...).in(...).order().order().limit().or().gte().gt() → thenable
function ordersBuilder() {
  const rows = [
    {
      id: ORDER_ID,
      status: 'active',
      priority: 'routine',
      code_code: '2345-7',
      code_display: 'Glucose',
      patient_id: PATIENT_UUID,
      requester_id: 'doc-1',
      authored_on: '2026-09-10T08:00:00Z',
      special_instructions: null,
      meta_last_updated: '2026-09-10T08:00:00Z',
      received_by_lab_id: LAB_ID,
      patients: { id: PATIENT_UUID, name_given: 'Ahmad', birth_date: null, birth_year: 1985 },
      practitioners: { id: 'doc-1', given_name: 'Dr', family_name: 'Who' },
    },
  ]
  const builder: any = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (v: { data: any; error: null }) => void) => resolve({ data: rows, error: null }),
  }
  return builder
}

// getOrderPatientDetails resolves the order, then patient, then observations.
function detailSrBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: ORDER_ID, patient_id: PATIENT_UUID, received_by_lab_id: LAB_ID },
          error: null,
        }),
      })),
    })),
  }
}
function detailPatBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { name_given: 'A', name_father: 'B', name_grandfather: 'C', gender: 'male', blood_group: 'O+', photo_url: null },
          error: null,
        }),
      })),
    })),
  }
}
function obsBuilder() {
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
  }
}

// verifyPatient: from('patients').select(...).eq(...).single()
function verifyPatientsBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: PATIENT_UUID, name_given: 'Ahmad', birth_date: null, birth_year: 1985, photo_url: null },
          error: null,
        }),
      })),
    })),
  }
}

// dispense monitoring: scope (service_requests) + events + mappings
function monitoringEventsBuilder() {
  const rows = [
    {
      id: 'row-1', seq: 1001, dispensing_event_id: 'de-aaa', patient_id: PATIENT_UUID,
      atc_code: 'N02AA01', dispensed_at: '2026-09-10T08:00:00Z',
      ordering_practitioner_ref: 'Practitioner/doc-1', hlc_timestamp: 'hlc-1', created_at: '2026-09-10T08:00:00Z',
      patients: { name_given: 'Ahmad', birth_date: null, birth_year: 1985 },
    },
  ]
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    then: (resolve: (v: { data: any; error: null }) => void) => resolve({ data: rows, error: null }),
  }
  return builder
}
function monitoringScopeBuilder() {
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [{ patient_id: PATIENT_UUID }], error: null })) })),
  }
}
function mappingsBuilder() {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => Promise.resolve({
        data: [{ atc_code: 'N02AA01', required_tests: [{ loincCode: '2276-4', testDisplay: 'Ferritin', initialDelayDays: 7, frequencyDays: 90, priority: 'routine' }] }],
        error: null,
      })),
    })),
  }
}

// Which "mode" we are testing selects the service_requests / patients builder.
let mode: 'orders' | 'detail' | 'verify' | 'monitoring' = 'orders'

// Story 58.4 (H-HUB-7): verifyPatient / getOrderPatientDetails now check consent
// in-body. An ACTIVE FULL_RECORD grant keeps the data-min contract byte-identical.
function consentsBuilder() {
  const rows = [{ id: 'consent-1', status: 'ACTIVE', category: ['FULL_RECORD'], date_time: '2026-01-01T00:00:00.000Z', provision_end: null }]
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) })) })) }
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') return labTechBuilder()
  if (table === 'organizations') return orgBuilder()
  if (table === 'org_subscriptions') return subBuilder()
  if (table === 'consents') return consentsBuilder()
  if (table === 'service_requests') {
    if (mode === 'orders') return ordersBuilder()
    if (mode === 'detail') return detailSrBuilder()
    if (mode === 'monitoring') return monitoringScopeBuilder()
  }
  if (table === 'patients') {
    if (mode === 'detail') return detailPatBuilder()
    if (mode === 'verify') return verifyPatientsBuilder()
  }
  if (table === 'observations') return obsBuilder()
  if (table === 'dispense_monitoring_events') return monitoringEventsBuilder()
  if (table === 'medication_lab_mappings') return mappingsBuilder()
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d, fromRowRaw: (d: any) => d, fromRows: (d: any[]) => d },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

function makeCaller() {
  const router = createTRPCRouter({ lab: labRouter })
  return createCallerFactory(router)({
    supabase: { from: mockFrom } as never,
    user: { sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  } as never)
}

describe('lab data-minimization contract — exact output field allowlists', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuditEmit.mockResolvedValue({ id: 'audit-1' }) })

  it('pullOrders order objects expose the list-tier fields incl. photo + demographics (Rule #7 revised 2026-09-24)', async () => {
    mode = 'orders'
    const res = await makeCaller().lab.pullOrders({ limit: 10 })
    expect(res.orders.length).toBeGreaterThan(0)
    const keys = Object.keys(res.orders[0]!).sort()
    expect(keys).toEqual(
      [
        'assignedToLab',
        'authoredOn',
        'orderId',
        'orderingPhysicianName',
        'patientAge',
        'patientFirstName',
        'patientGender',
        'patientPhone',
        'patientPhotoUrl',
        'patientRef',
        'specialInstructions',
        'status',
        'testsRequested',
        'urgency',
      ].sort(),
    )
    // Photo + demographics are now permitted (revised Rule #7). The two identity
    // secrets remain forbidden on any lab surface: the raw National ID and the real
    // patient UUID (patientRef stays an opaque blind index, never `patientId`).
    for (const forbidden of ['nationalId', 'patientId', 'birthDate', 'dob']) {
      expect(keys).not.toContain(forbidden)
    }
    // patientRef must remain the opaque blind index (Patient/<hash>), not a raw UUID.
    expect(res.orders[0]!.patientRef.startsWith('Patient/')).toBe(true)
  })

  it('verifyPatient exposes ONLY firstName + age + patientRef + photoUrl', async () => {
    mode = 'verify'
    const res = await makeCaller().lab.verifyPatient({ query: 'NID-1', method: 'NATIONAL_ID' })
    const keys = Object.keys(res).sort()
    expect(keys).toEqual(['age', 'firstName', 'patientRef', 'photoUrl'].sort())
    for (const forbidden of ['gender', 'phone', 'nationalId', 'patientId', 'bloodGroup', 'fullName', 'vitals']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('getOrderPatientDetails exposes ONLY the sanctioned detail-tier fields', async () => {
    mode = 'detail'
    const res = await makeCaller().lab.getOrderPatientDetails({ orderId: ORDER_ID })
    const keys = Object.keys(res).sort()
    expect(keys).toEqual(['bloodGroup', 'fullName', 'gender', 'photoUrl', 'vitals'].sort())
    // fullName sub-object is exactly given/father/grandfather.
    expect(Object.keys(res.fullName).sort()).toEqual(['father', 'given', 'grandfather'])
    for (const forbidden of ['phone', 'nationalId', 'patientId', 'age', 'firstName']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('pullDispenseMonitoringEvents exposes requirements and NO medication identity', async () => {
    mode = 'monitoring'
    const res = await makeCaller().lab.pullDispenseMonitoringEvents({ limit: 10 })
    expect(res.events.length).toBeGreaterThan(0)
    const keys = Object.keys(res.events[0]!).sort()
    expect(keys).toEqual(
      [
        'dispensedAt',
        'dispensingEventId',
        'hlcTimestamp',
        'orderingPractitionerRef',
        'patientAge',
        'patientFirstName',
        'patientRef',
        'requirements',
      ].sort(),
    )
    // Medication identity is stripped server-side (audit C-LAB-1).
    for (const forbidden of ['atcCode', 'medicationDisplay', 'medicationCode', 'nationalId', 'patientId']) {
      expect(keys).not.toContain(forbidden)
    }
    // Each requirement carries only the LOINC test + due window.
    const reqKeys = Object.keys(res.events[0]!.requirements[0]!).sort()
    expect(reqKeys).toEqual(['frequencyDays', 'initialDelayDays', 'loincCode', 'priority', 'testDisplay'].sort())
  })
})
