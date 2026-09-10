import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Gap #4: Pharmacy-Lite can pull a patient's active prescriptions from the Hub
 * (no signed prescription-QR required) after identifying the patient. Scoped to
 * PHARMACIST, filtered to un-dispensed statuses, and — critically — queried by the
 * BARE patient UUID that the sync producer (flattenMedicationRequest) stores in
 * subject_reference.
 */

// The real db.fromRows decrypts + snake_case→camelCase; mirror that here so the
// endpoint's camelCase projection is exercised against realistic row shapes.
function snakeToCamel(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  const out: any = {}
  for (const k of Object.keys(obj)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = obj[k]
  return out
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => snakeToCamel(d),
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d.map(snakeToCamel),
  },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)

const PHARMACIST_USER = { sub: 'pharma-001', role: 'PHARMACIST', sessionId: 'sess-3', orgId: 'org-test-001' }
const DOCTOR_USER = { sub: 'doctor-001', role: 'DOCTOR', sessionId: 'sess-1', orgId: 'org-test-001' }
const PATIENT_UUID = '00000000-0000-4000-8000-000000000001'
const RX_UUID = '00000000-0000-4000-8000-000000000200'

function mockOrganizationsTable() {
  return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { status: 'TRIAL' }, error: null }) }) }) }
}
function mockOrgSubscriptionsTable() {
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

function makeCtx(user: unknown, from: unknown) {
  return {
    supabase: { from, rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }) } as never,
    user: user as never,
    headers: new Headers(),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('medication.listForPharmacy', () => {
  it('denies a DOCTOR (pharmacist-only)', async () => {
    const from = vi.fn((t: string) => (t === 'organizations' ? mockOrganizationsTable() : mockOrgSubscriptionsTable()))
    const caller = createCaller(makeCtx(DOCTOR_USER, from))
    await expect(caller.medication.listForPharmacy({ patientRef: PATIENT_UUID })).rejects.toThrow(/denied|forbidden/i)
  })

  it('returns un-dispensed prescriptions, queried by the BARE patient UUID', async () => {
    const capture: { subjectRef?: unknown; statusFilter?: unknown } = {}
    const rows = [
      { id: RX_UUID, medication_display: 'Amoxicillin', medication_text: 'Amoxicillin 500mg', dosage_instruction: { text: '1 tab TID' }, prescription_status: 'ACTIVE', authored_on: '2026-05-10T10:00:00Z', requester_id: 'doc-1' },
    ]
    const from = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => { if (col === 'subject_reference') capture.subjectRef = val; return builder }),
        in: vi.fn((col: string, val: unknown) => { if (col === 'prescription_status') capture.statusFilter = val; return builder }),
        order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      }
      return builder
    })

    const caller = createCaller(makeCtx(PHARMACIST_USER, from))
    const result = await caller.medication.listForPharmacy({ patientRef: PATIENT_UUID })

    // Bare UUID, matching what sync stores — NOT `Patient/<uuid>`.
    expect(capture.subjectRef).toBe(PATIENT_UUID)
    expect(capture.statusFilter).toEqual(['ACTIVE', 'PARTIALLY_DISPENSED'])
    expect(result.prescriptions).toHaveLength(1)
    expect(result.prescriptions[0]!.id).toBe(RX_UUID)
    expect(result.prescriptions[0]!.medicationDisplay).toBe('Amoxicillin')
  })

  it('emits a PHI_READ audit event', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'organizations') return mockOrganizationsTable()
      if (table === 'org_subscriptions') return mockOrgSubscriptionsTable()
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
      return builder
    })
    const ctx = makeCtx(PHARMACIST_USER, from)
    const caller = createCaller(ctx)
    await caller.medication.listForPharmacy({ patientRef: PATIENT_UUID })
    expect((ctx.supabase as any).rpc).toHaveBeenCalledWith('audit_emit_with_lock', expect.objectContaining({ p_action: 'PHI_READ' }))
  })
})
