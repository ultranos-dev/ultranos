import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Task 5: lab.pullDispenseMonitoringEvents — TDD test suite.
 *
 * Assertions:
 *  (a) patientRef starts with "Patient/" and is NOT the raw seeded uuid
 *  (b) returned event has NO patientId / patient_id key
 *  (c) keyset pagination: limit:1 returns nextCursor non-null; second page returns nextCursor null
 *  (d) a READ audit on DISPENSE_MONITORING_EVENT was emitted
 *
 * Harness modelled on lab-orders.test.ts (createCaller / ctx with lab role,
 * mock ctx.supabase.from('dispense_monitoring_events')).
 */

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// ── Audit mock ────────────────────────────────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

// ── Crypto mock — deterministic so assertions are predictable ─
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((input: string) => `hmac-${input}`),
  encryptField: vi.fn((input: string) => `enc-${input}`),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({
    encryptionKey: 'test-enc-key',
    hmacKey: 'test-hmac-key',
  })),
}))

// ── Supabase mock ─────────────────────────────────────────────
// Two seeded rows for pagination test.
const RAW_PATIENT_UUID_1 = '11111111-1111-1111-1111-111111111111'
const RAW_PATIENT_UUID_2 = '22222222-2222-2222-2222-222222222222'

const SEED_ROWS = [
  {
    id: 'row-1',
    seq: 1001,
    dispensing_event_id: 'de-aaa',
    patient_id: RAW_PATIENT_UUID_1,
    atc_code: 'N02AA01',
    dispensed_at: '2026-09-10T08:00:00.000Z',
    ordering_practitioner_ref: 'Practitioner/doc-1',
    hlc_timestamp: 'hlc-1',
    created_at: '2026-09-10T08:00:00.000Z',
    patients: { name_given: 'Ahmad', birth_date: null, birth_year: 1985 },
  },
  {
    id: 'row-2',
    seq: 1002,
    dispensing_event_id: 'de-bbb',
    patient_id: RAW_PATIENT_UUID_2,
    atc_code: 'N02AA59',
    dispensed_at: '2026-09-11T09:00:00.000Z',
    ordering_practitioner_ref: 'Practitioner/doc-2',
    hlc_timestamp: 'hlc-2',
    created_at: '2026-09-11T09:00:00.000Z',
    patients: { name_given: 'Sara', birth_date: '1990-03-15', birth_year: null },
  },
]

// medication_lab_mappings — the hub resolves required tests server-side from the
// ATC code. atc_code is the internal join key only; it never reaches the DTO.
const MAPPING_ROWS = [
  {
    atc_code: 'N02AA01',
    required_tests: [
      { loincCode: '2276-4', testDisplay: 'Ferritin', initialDelayDays: 7, frequencyDays: 90, priority: 'routine' },
    ],
  },
  {
    atc_code: 'N02AA59',
    required_tests: [
      { loincCode: '14682-9', testDisplay: 'Serum Creatinine', initialDelayDays: 14, frequencyDays: 30, priority: 'urgent' },
    ],
  },
]

// Chainable Supabase query builder that returns rows matching the requested limit/cursor.
function makeQueryBuilder(seed: typeof SEED_ROWS) {
  let _cursor: number | undefined
  let _limit: number = 200
  let _since: string | undefined
  let _inPatientIds: string[] | undefined

  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn((n: number) => { _limit = n; return builder }),
    gte: vi.fn((_col: string, val: string) => { _since = val; return builder }),
    gt: vi.fn((_col: string, val: number) => { _cursor = val; return builder }),
    in: vi.fn((_col: string, vals: string[]) => { _inPatientIds = vals; return builder }),
    then: (resolve: (v: { data: any; error: null }) => void) => {
      let rows = seed
      if (_inPatientIds != null) rows = rows.filter(r => _inPatientIds!.includes(r.patient_id))
      if (_since != null) rows = rows.filter(r => r.created_at >= _since!)
      if (_cursor != null) rows = rows.filter(r => r.seq > _cursor!)
      rows = rows.slice(0, _limit)
      return resolve({ data: rows, error: null })
    },
  }
  return builder
}

// service_requests scope lookup: .from('service_requests').select('patient_id').eq('received_by_lab_id', labId)
// The lab (lab-x) has claimed orders for BOTH seeded patients.
function makeScopeBuilder(patientIds: string[]) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve({ data: patientIds.map((id) => ({ patient_id: id })), error: null })),
  }
  return builder
}

// medication_lab_mappings lookup: .select('atc_code, required_tests').in('atc_code', [...])
function makeMappingBuilder(rows: typeof MAPPING_ROWS) {
  const builder: any = {
    select: vi.fn(() => builder),
    in: vi.fn((_col: string, vals: string[]) =>
      Promise.resolve({ data: rows.filter((m) => vals.includes(m.atc_code)), error: null })),
  }
  return builder
}

// lab_technicians mock (required by labRestrictedProcedure)
const mockTechSingle = vi.fn().mockResolvedValue({
  data: {
    id: 'tech-rec-1',
    lab_id: 'lab-x',
    practitioner_id: 'tech-001',
    labs: { id: 'lab-x', status: 'ACTIVE' },
  },
  error: null,
})

const mockFrom = vi.fn((table: string) => {
  if (table === 'lab_technicians') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockTechSingle })),
      })),
    }
  }
  if (table === 'dispense_monitoring_events') {
    return makeQueryBuilder(SEED_ROWS)
  }
  if (table === 'service_requests') {
    // Lab-x has claimed orders for both seeded patients → both in scope.
    return makeScopeBuilder([RAW_PATIENT_UUID_1, RAW_PATIENT_UUID_2])
  }
  if (table === 'medication_lab_mappings') {
    return makeMappingBuilder(MAPPING_ROWS)
  }
  // enforceVerifiedOrg — org check
  if (table === 'organizations') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }),
        }),
      }),
    }
  }
  // enforceEntitlement — subscription check
  if (table === 'org_subscriptions') {
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
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
  }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

vi.mock('@/lib/virus-scanner', () => ({
  scanFile: vi.fn().mockResolvedValue({ status: 'clean', hash: 'sha256-mock' }),
}))
vi.mock('@/services/ocr', () => ({
  analyzeFile: vi.fn().mockResolvedValue({ suggestions: [], processingTimeMs: 100, available: true, provider: 'mock' }),
}))

// ── tRPC setup ────────────────────────────────────────────────
const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { labRouter } = await import('../trpc/routers/lab')

const router = createTRPCRouter({ lab: labRouter })

function makeCaller() {
  return createCallerFactory(router)({
    supabase: { from: mockFrom } as never,
    user: { sub: 'tech-001', role: 'LAB_TECH' as const, sessionId: 'sess-test-1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  } as never)
}

// ─────────────────────────────────────────────────────────────
describe('lab.pullDispenseMonitoringEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-wire audit mock after clearAllMocks
    mockAuditEmit.mockResolvedValue({ id: 'audit-1' })
    mockTechSingle.mockResolvedValue({
      data: { id: 'tech-rec-1', lab_id: 'lab-x', practitioner_id: 'tech-001', labs: { id: 'lab-x', status: 'ACTIVE' } },
      error: null,
    })
  })

  it('endpoint exists on the lab router', () => {
    expect(labRouter).toBeDefined()
    expect(labRouter._def).toBeDefined()
  })

  it('(a) patientRef starts with "Patient/" and is not the raw patient uuid', async () => {
    const caller = makeCaller()
    const res = await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })

    expect(res.events.length).toBeGreaterThan(0)
    const ev = res.events[0]!
    expect(ev.patientRef).toMatch(/^Patient\//)
    expect(ev.patientRef).not.toBe(`Patient/${RAW_PATIENT_UUID_1}`)
    // The mock generateBlindIndex returns "hmac-<input>", so the blind ref should be "Patient/hmac-<uuid>"
    expect(ev.patientRef).toBe(`Patient/hmac-${RAW_PATIENT_UUID_1}`)
  })

  it('(b) returned event has no patientId or patient_id key', async () => {
    const caller = makeCaller()
    const res = await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })

    expect(res.events.length).toBeGreaterThan(0)
    const ev = res.events[0]! as Record<string, unknown>
    expect('patientId' in ev).toBe(false)
    expect('patient_id' in ev).toBe(false)
  })

  it('(c) keyset pagination: limit:1 returns non-null nextCursor; second page returns nextCursor null', async () => {
    const caller = makeCaller()

    // Page 1 — should return 1 event and a non-null cursor (seq of last row = 1001)
    const page1 = await caller.lab.pullDispenseMonitoringEvents({ limit: 1 })
    expect(page1.events).toHaveLength(1)
    expect(page1.nextCursor).not.toBeNull()
    expect(page1.nextCursor).toBe(1001)

    // Page 2 — advance cursor past seq 1001, seed has one more row (seq 1002)
    const page2 = await caller.lab.pullDispenseMonitoringEvents({ limit: 1, cursor: page1.nextCursor! })
    expect(page2.events).toHaveLength(1)
    expect(page2.nextCursor).not.toBeNull()
    expect(page2.nextCursor).toBe(1002)

    // Page 3 — no more rows
    const page3 = await caller.lab.pullDispenseMonitoringEvents({ limit: 1, cursor: page2.nextCursor! })
    expect(page3.events).toHaveLength(0)
    expect(page3.nextCursor).toBeNull()
  })

  it('(d) emits a READ audit on DISPENSE_MONITORING_EVENT', async () => {
    const caller = makeCaller()
    await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'DISPENSE_MONITORING_EVENT',
        resourceId: 'monitoring-pull',
        outcome: 'SUCCESS',
      }),
    )
  })

  it('audit metadata has no PHI — only eventCount, labId, since (Rule #1)', async () => {
    const caller = makeCaller()
    await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })

    const call = (mockAuditEmit.mock.calls[0] as any[])[0] as Record<string, any>
    const meta = call.metadata as Record<string, unknown>
    expect(meta).toHaveProperty('eventCount')
    expect(meta).toHaveProperty('labId')
    expect(meta).toHaveProperty('since')
    // No raw patient data in metadata
    expect(JSON.stringify(meta)).not.toContain(RAW_PATIENT_UUID_1)
    expect(JSON.stringify(meta)).not.toContain('Ahmad')
  })

  it('event fields match DispenseMonitoringEventDTO shape — requirements, NO medication identity', async () => {
    const caller = makeCaller()
    const res = await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })

    const ev = res.events[0]! as Record<string, unknown>
    expect(ev).toHaveProperty('dispensingEventId', 'de-aaa')
    expect(ev).toHaveProperty('patientRef')
    expect(ev).toHaveProperty('patientFirstName', 'Ahmad')
    expect(ev).toHaveProperty('patientAge')
    expect(typeof ev.patientAge).toBe('number')
    expect(ev).toHaveProperty('dispensedAt', '2026-09-10T08:00:00.000Z')
    expect(ev).toHaveProperty('orderingPractitionerRef', 'Practitioner/doc-1')
    expect(ev).toHaveProperty('hlcTimestamp', 'hlc-1')

    // Medication identity is stripped server-side (audit C-LAB-1) — never on the DTO.
    expect('atcCode' in ev).toBe(false)
    expect('medicationDisplay' in ev).toBe(false)
    expect(JSON.stringify(ev)).not.toContain('N02AA01')

    // The resolved monitoring requirement is delivered instead.
    const requirements = ev.requirements as Array<Record<string, unknown>>
    expect(Array.isArray(requirements)).toBe(true)
    expect(requirements[0]).toMatchObject({
      loincCode: '2276-4',
      testDisplay: 'Ferritin',
      initialDelayDays: 7,
      frequencyDays: 90,
      priority: 'routine',
    })
  })

  it('lab-scoping: a lab with no claimed orders sees an empty feed (H-HUB-3)', async () => {
    // Override service_requests to return no claimed patients for this lab.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lab_technicians') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockTechSingle })) })) }
      }
      if (table === 'service_requests') return makeScopeBuilder([])
      if (table === 'dispense_monitoring_events') return makeQueryBuilder(SEED_ROWS)
      if (table === 'medication_lab_mappings') return makeMappingBuilder(MAPPING_ROWS)
      if (table === 'organizations') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'org-1', status: 'ACTIVE', cancelled_at: null }, error: null }) }) }) }
      }
      if (table === 'org_subscriptions') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sub-1', status: 'ACTIVE' }, error: null }), limit: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1', status: 'ACTIVE' }], error: null }) }) }) }) }) }
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) }
    })

    const caller = makeCaller()
    const res = await caller.lab.pullDispenseMonitoringEvents({ limit: 100 })
    expect(res.events).toHaveLength(0)
    expect(res.nextCursor).toBeNull()
  })
})
