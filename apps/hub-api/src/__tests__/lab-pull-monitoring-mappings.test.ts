import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Task 6: lab.pullMonitoringMappings — TDD test suite.
 *
 * Assertions:
 *  (a) both seeded mappings returned with correct camelCase mapping (atcCode, medicationDisplay, version, requiredTests)
 *  (b) sinceVersion filters to only newer-version rows
 *  (c) output correctly maps requiredTests from DB jsonb
 *
 * Harness modelled on lab-pull-monitoring-events.test.ts (createCaller / ctx with lab role,
 * mock ctx.supabase.from('medication_lab_mappings')).
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
// Two seeded rows for version filter test.
const SEED_ROWS = [
  {
    atc_code: 'J01AA01',
    medication_display: 'Amoxicillin 500mg',
    version: 1,
    updated_at: '2026-09-01T00:00:00.000Z',
    required_tests: [
      { loincCode: '2276-4', testDisplay: 'Serum Creatinine', frequencyDays: 7, initialDelayDays: 0, priority: 'routine' },
    ],
  },
  {
    atc_code: 'L01AA01',
    medication_display: 'Methotrexate 2.5mg',
    version: 2,
    updated_at: '2026-09-10T00:00:00.000Z',
    required_tests: [
      { loincCode: '2276-4', testDisplay: 'Serum Creatinine', frequencyDays: 3, initialDelayDays: 1, priority: 'urgent' },
      { loincCode: '1751-7', testDisplay: 'Albumin', frequencyDays: 7, initialDelayDays: 0, priority: 'routine' },
    ],
  },
]

// Chainable Supabase query builder that returns rows matching the requested filters.
function makeQueryBuilder(seed: typeof SEED_ROWS) {
  let _sinceVersion: number | undefined

  const builder: any = {
    select: vi.fn(() => builder),
    gt: vi.fn((_col: string, val: number) => { _sinceVersion = val; return builder }),
    then: (resolve: (v: { data: any; error: null }) => void) => {
      let rows = seed
      if (_sinceVersion != null) rows = rows.filter(r => r.version > _sinceVersion!)
      return resolve({ data: rows, error: null })
    },
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
  if (table === 'medication_lab_mappings') {
    return makeQueryBuilder(SEED_ROWS)
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
    user: { sub: 'tech-001', role: 'LAB_TECH', sessionId: 'sess-test-1', orgId: 'org-1' },
    headers: new Headers(),
  } as never)
}

// ─────────────────────────────────────────────────────────────
describe('lab.pullMonitoringMappings', () => {
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

  it('(a) returns both seeded mappings with correct camelCase mapping', async () => {
    const caller = makeCaller()
    const res = await caller.lab.pullMonitoringMappings({})

    expect(res.mappings.length).toBe(2)

    const mapping1 = res.mappings[0]!
    expect(mapping1.atcCode).toBe('J01AA01')
    expect(mapping1.medicationDisplay).toBe('Amoxicillin 500mg')
    expect(mapping1.version).toBe(1)
    expect(mapping1.requiredTests).toHaveLength(1)
    expect(mapping1.requiredTests[0]!.loincCode).toBe('2276-4')
    expect(mapping1.requiredTests[0]!.testDisplay).toBe('Serum Creatinine')
    expect(mapping1.requiredTests[0]!.frequencyDays).toBe(7)
    expect(mapping1.requiredTests[0]!.initialDelayDays).toBe(0)
    expect(mapping1.requiredTests[0]!.priority).toBe('routine')

    const mapping2 = res.mappings[1]!
    expect(mapping2.atcCode).toBe('L01AA01')
    expect(mapping2.medicationDisplay).toBe('Methotrexate 2.5mg')
    expect(mapping2.version).toBe(2)
    expect(mapping2.requiredTests).toHaveLength(2)
  })

  it('(b) sinceVersion filters to only newer-version rows', async () => {
    const caller = makeCaller()

    // No filter — both rows
    const all = await caller.lab.pullMonitoringMappings({})
    expect(all.mappings).toHaveLength(2)

    // sinceVersion: 1 — only version 2
    const filtered = await caller.lab.pullMonitoringMappings({ sinceVersion: 1 })
    expect(filtered.mappings).toHaveLength(1)
    expect(filtered.mappings[0]!.version).toBe(2)
    expect(filtered.mappings[0]!.atcCode).toBe('L01AA01')
  })

  it('(c) requiredTests is correctly mapped from DB jsonb', async () => {
    const caller = makeCaller()
    const res = await caller.lab.pullMonitoringMappings({})

    const mapping1 = res.mappings[0]!
    const test1 = mapping1.requiredTests[0]!
    expect(test1).toEqual({
      loincCode: '2276-4',
      testDisplay: 'Serum Creatinine',
      frequencyDays: 7,
      initialDelayDays: 0,
      priority: 'routine',
    })

    const mapping2 = res.mappings[1]!
    expect(mapping2.requiredTests).toHaveLength(2)
    expect(mapping2.requiredTests[0]!.priority).toBe('urgent')
    expect(mapping2.requiredTests[1]!.loincCode).toBe('1751-7')
  })
})
