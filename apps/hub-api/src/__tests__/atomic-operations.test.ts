/**
 * Story 61.3 — Atomic Multi-Write Operations.
 *
 * These tests exercise the four non-transactional flows that were converted to
 * atomic Postgres RPCs (merge/unmerge, submitResult analytes, recordDispense,
 * lab.register). They mock the RPC calls exactly like the existing atomic-RPC
 * test (patient-consent-atomic.test.ts mocks create_patient_with_consent), and
 * cover two axes per flow:
 *
 *   1. Failure injection — the RPC returns an error (a mid-tx crash the DB rolled
 *      back). The router must surface the right tRPC error and MUST NOT perform a
 *      partial follow-on write (no orphan, no compensating delete). Because every
 *      mutating write for that flow now lives inside the single RPC call, a
 *      rejected RPC = a clean all-or-nothing rollback.
 *   2. Response-shape parity — on success the router returns the SAME shape it
 *      returned before the refactor.
 *
 * The DB transaction guarantee itself lives in Postgres; here we assert the Hub
 * contract around it (error mapping, no partial writes, identical shapes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OverrideReasonCode } from '@ultranos/shared-types'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('../trpc/middleware/enforceConsent', () => ({
  enforceConsentMiddleware: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))
vi.mock('../trpc/middleware/enforceResourceAccess', () => ({
  enforceResourceAccess: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))
vi.mock('../trpc/middleware/enforceEntitlement', () => ({
  enforceEntitlement: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))
vi.mock('../trpc/middleware/enforceVerifiedOrg', () => ({
  enforceVerifiedOrg: vi.fn(() => async (opts: any) => opts.next({ ctx: opts.ctx })),
}))

vi.mock('@ultranos/mpi-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ultranos/mpi-engine')>()
  return { ...actual, computeMpiResult: vi.fn().mockReturnValue({ decision: 'ALLOW', topScore: 0, candidates: [] }) }
})
vi.mock('@/lib/mpi-candidate-query', () => ({ fetchMpiCandidates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/mpi-proceed-token', () => ({
  signProceedToken: vi.fn().mockResolvedValue('t'),
  verifyProceedToken: vi.fn().mockResolvedValue({ jti: 'j', candidateIds: [], maxScore: 0, issuedTo: 'x', exp: 9999999999 }),
  consumeProceedToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/async-mpi-scoring', () => ({ runAsyncMpiScoring: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((i: string) => `hmac-${i}`),
  encryptField: vi.fn((i: string) => `enc-${i}`),
}))
vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({ encryptionKey: 'k', hmacKey: 'h' })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)

const SURVIVOR_ID = '11111111-1111-1111-1111-111111111111'
const DUPLICATE_ID = '22222222-2222-2222-2222-222222222222'
const MERGE_AUDIT_ID = '33333333-3333-3333-3333-333333333333'
const ADMIN_USER = { sub: 'admin-001', role: 'ADMIN' as const, sessionId: 's', orgId: null, status: null, facilityId: null }

function patientRow(id: string, overrides: Record<string, any> = {}) {
  return { id, name_given: 'X', is_active: true, ultranos_is_active: true, mpi_warn: false, ...overrides }
}

beforeEach(() => { vi.clearAllMocks() })

// ── Flow 1: merge / unmerge (H-ADM-2) ───────────────────────────────────────
describe('atomic merge_patient_atomic', () => {
  function mergeCtx(rpc: ReturnType<typeof vi.fn>) {
    const from = vi.fn((table: string) => {
      if (table === 'patients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_c: string, val: string) => ({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: val === SURVIVOR_ID ? patientRow(SURVIVOR_ID) : patientRow(DUPLICATE_ID, { name_given: 'Dup' }),
                  error: null,
                }),
              }),
            })),
          }),
        }
      }
      return {}
    })
    return { supabase: { from, rpc } as never, user: ADMIN_USER, headers: new Headers() }
  }

  it('SHAPE: returns { success, mergeAuditId } on RPC success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { mergeAuditId: MERGE_AUDIT_ID }, error: null })
    const caller = createCaller(mergeCtx(rpc))
    const res = await caller.patientAdmin.merge({
      survivorId: SURVIVOR_ID, duplicateId: DUPLICATE_ID, fieldResolutions: { name_given: 'duplicate' },
    })
    expect(res).toEqual({ success: true, mergeAuditId: MERGE_AUDIT_ID })
    // Exactly one atomic RPC call carries every merge write.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('merge_patient_atomic', expect.any(Object))
  })

  it('FAILURE INJECTION: a mid-tx crash (RPC error) → INTERNAL_SERVER_ERROR, no audit-success emitted', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'crash mid-tx' } })
    const caller = createCaller(mergeCtx(rpc))
    await expect(
      caller.patientAdmin.merge({ survivorId: SURVIVOR_ID, duplicateId: DUPLICATE_ID, fieldResolutions: {} }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    // No post-commit PHI_WRITE success audit when the whole merge rolled back.
    expect(mockAuditEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PHI_WRITE', metadata: expect.objectContaining({ operation: 'patient_merge' }) }),
    )
  })

  it('FAILURE INJECTION: survivor deactivated concurrently → NOT_FOUND (RPC guard rolled back)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'SURVIVOR_NOT_ACTIVE' } })
    const caller = createCaller(mergeCtx(rpc))
    await expect(
      caller.patientAdmin.merge({ survivorId: SURVIVOR_ID, duplicateId: DUPLICATE_ID, fieldResolutions: {} }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('atomic unmerge_patient_atomic', () => {
  function unmergeCtx(rpc: ReturnType<typeof vi.fn>, deadline: string) {
    const auditRow = {
      id: MERGE_AUDIT_ID, survivor_id: SURVIVOR_ID, duplicate_id: DUPLICATE_ID,
      field_resolutions: { name_given: 'duplicate' },
      original_survivor: patientRow(SURVIVOR_ID, { name_given: 'Orig' }),
      original_duplicate: patientRow(DUPLICATE_ID),
      merged_by: 'admin-001', unmerge_deadline: deadline, status: 'ACTIVE',
    }
    const from = vi.fn((table: string) => {
      if (table === 'merge_audits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: auditRow, error: null }) }),
            }),
          }),
        }
      }
      return {}
    })
    return { supabase: { from, rpc } as never, user: ADMIN_USER, headers: new Headers() }
  }

  it('SHAPE: returns { success: true } on RPC success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null })
    const caller = createCaller(unmergeCtx(rpc, new Date(Date.now() + 3600_000).toISOString()))
    const res = await caller.patientAdmin.unmerge({ mergeAuditId: MERGE_AUDIT_ID })
    expect(res).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('unmerge_patient_atomic', expect.any(Object))
  })

  it('FAILURE INJECTION: RPC crash → INTERNAL_SERVER_ERROR', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'crash' } })
    const caller = createCaller(unmergeCtx(rpc, new Date(Date.now() + 3600_000).toISOString()))
    await expect(caller.patientAdmin.unmerge({ mergeAuditId: MERGE_AUDIT_ID })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})

// ── Flow 2: submitResult analytes (M-HUB-4) ─────────────────────────────────
describe('atomic replace_report_observations', () => {
  const REPORT_ID = '55555555-5555-5555-5555-555555555555'
  const PATIENT_REF = 'Patient/hmac-abc'

  function labCtx(rpc: ReturnType<typeof vi.fn>) {
    const from = vi.fn((table: string) => {
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'tech-rec', lab_id: 'lab-1', practitioner_id: 'p-1', labs: { id: 'lab-1', status: 'ACTIVE' } }, error: null }),
            }),
          }),
        }
      }
      if (table === 'diagnostic_reports') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
          upsert: vi.fn().mockReturnValue({ error: null }),
        }
      }
      if (table === 'labs') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { name: 'Lab' }, error: null }) }) }) }
      }
      return { select: vi.fn() }
    })
    return { supabase: { from, rpc } as never, user: { sub: 'tech-1', role: 'LAB_TECH' as const, sessionId: 's', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }, headers: new Headers() }
  }

  function bundle() {
    return {
      diagnosticReport: {
        id: REPORT_ID, resourceType: 'DiagnosticReport' as const, status: 'preliminary' as const,
        code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }], text: 'CBC' },
        subject: { reference: PATIENT_REF }, issued: '2026-09-14T09:00:00.000Z',
        _ultranos: { createdAt: '2026-09-14T09:00:00.000Z', isOfflineCreated: true, templateVersion: 'v1' },
        meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
      },
      observations: [{
        id: '44444444-4444-4444-4444-444444444444', resourceType: 'Observation' as const, status: 'preliminary' as const,
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hgb' }], text: 'Hgb' },
        valueQuantity: { value: 12.5, unit: 'g/dL' },
        _ultranos: { isOfflineCreated: true, createdAt: '2026-09-14T09:00:00.000Z', templateVersion: 'v1' },
        meta: { lastUpdated: '2026-09-14T09:00:00.000Z', versionId: '1' },
      }],
    }
  }

  it('SHAPE: returns { diagnosticReportId, observationCount } on RPC success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { observationCount: 1 }, error: null })
    const caller = createCaller(labCtx(rpc))
    const res = await caller.lab.submitResult(bundle())
    expect(res).toEqual({ diagnosticReportId: REPORT_ID, observationCount: 1 })
    // The atomic delete+insert is a single RPC — a crash can't leave the report empty.
    expect(rpc).toHaveBeenCalledWith('replace_report_observations', expect.objectContaining({ p_report_id: REPORT_ID }))
  })

  it('FAILURE INJECTION: analyte-replace RPC crash → INTERNAL_SERVER_ERROR (no partial analyte state)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'crash mid-tx' } })
    const caller = createCaller(labCtx(rpc))
    await expect(caller.lab.submitResult(bundle())).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})

// ── Flow 3: recordDispense (M-HUB-4) ─────────────────────────────────────────
describe('atomic record_dispense_atomic', () => {
  const DISPENSE_UUID = '00000000-0000-4000-8000-000000000010'
  const RX_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const PHARM = { sub: 'pharm-1', role: 'PHARMACIST' as const, sessionId: 's', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }
  const input = {
    dispenseId: DISPENSE_UUID, prescriptionId: RX_UUID, medicationCode: 'M', medicationDisplay: 'Med',
    patientRef: 'Patient/pat-1', pharmacistRef: 'Practitioner/pharm-1',
    whenHandedOver: '2026-04-29T12:00:00.000Z', hlcTimestamp: '000001714400000:00000:n', status: 'completed' as const,
  }
  const ACTIVE_RX = { id: RX_UUID, prescription_status: 'ACTIVE', status: 'active', hlc_timestamp: null, interaction_check: 'CLEAR', interaction_check_server: 'CLEAR', subject_reference: 'pat-1', medication_display: 'Med', requester_id: null }

  function dispenseFrom() {
    let rxN = 0
    return vi.fn((table: string) => {
      if (table === 'consents') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 'c', status: 'ACTIVE', category: ['PRESCRIPTIONS', 'FULL_RECORD'], date_time: '2026-01-01T00:00:00Z', provision_end: null }], error: null }) }) }) }
      if (table === 'medication_requests') {
        rxN++
        if (rxN === 1) return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: ACTIVE_RX, error: null }) }) }) }
        return {}
      }
      if (table === 'medication_dispenses') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
      }
      // medication_statements / notifications / monitoring — best-effort passthrough
      const proxy: any = new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : vi.fn().mockImplementation(() => proxy)) })
      proxy.single = vi.fn().mockResolvedValue({ data: null, error: null })
      proxy.limit = vi.fn().mockResolvedValue({ data: [], error: null })
      proxy.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      return proxy
    })
  }

  function ctxWith(rpcImpl: (fn: string, args: any) => Promise<any>) {
    return { supabase: { from: dispenseFrom(), rpc: vi.fn(rpcImpl) } as never, user: PHARM, headers: new Headers() }
  }

  it('SHAPE: returns success shape on DISPENSED outcome', async () => {
    const rpc = (fn: string, args: any) =>
      fn === 'record_dispense_atomic'
        ? Promise.resolve({ data: { outcome: 'DISPENSED', dispenseId: args.p_dispense.id, prescriptionStatus: 'DISPENSED', status: 'completed', dispensedAt: input.whenHandedOver, reviewError: null }, error: null })
        : Promise.resolve({ data: [{ chain_hash: 'h' }], error: null })
    const caller = createCaller(ctxWith(rpc))
    const res = await caller.medication.recordDispense(input)
    expect(res).toMatchObject({ success: true, dispenseId: DISPENSE_UUID, prescriptionStatus: 'completed', conflictDetected: false })
  })

  it('IDEMPOTENCY: ALREADY_SYNCED outcome returns alreadySynced=true (no prescription mutation)', async () => {
    const rpc = (fn: string) =>
      fn === 'record_dispense_atomic'
        ? Promise.resolve({ data: { outcome: 'ALREADY_SYNCED' }, error: null })
        : Promise.resolve({ data: [{ chain_hash: 'h' }], error: null })
    const caller = createCaller(ctxWith(rpc))
    const res = await caller.medication.recordDispense(input)
    expect(res).toMatchObject({ success: true, dispenseId: DISPENSE_UUID, alreadySynced: true, conflictDetected: false })
  })

  it('FAILURE INJECTION: STATUS_CONFLICT (guard failed, tx rolled back) → CONFLICT, no orphan dispense', async () => {
    const rpc = (fn: string) =>
      fn === 'record_dispense_atomic'
        ? Promise.resolve({ data: null, error: { code: 'P0001', message: 'STATUS_CONFLICT' } })
        : Promise.resolve({ data: [{ chain_hash: 'h' }], error: null })
    const caller = createCaller(ctxWith(rpc))
    await expect(caller.medication.recordDispense(input)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('FAILURE INJECTION: RPC crash → INTERNAL_SERVER_ERROR', async () => {
    const rpc = (fn: string) =>
      fn === 'record_dispense_atomic'
        ? Promise.resolve({ data: null, error: { code: 'XX000', message: 'crash' } })
        : Promise.resolve({ data: [{ chain_hash: 'h' }], error: null })
    const caller = createCaller(ctxWith(rpc))
    await expect(caller.medication.recordDispense(input)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })

  it('OVERRIDE: passes p_has_override + p_review with the verified supervisor id to the RPC', async () => {
    const SUPERVISOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const PIN = '4321'
    const { createHash } = await import('node:crypto')
    const PIN_HASH = createHash('sha256').update(PIN).digest('hex')
    let captured: any = null
    // supervisor lookup lives on practitioners; add it to the from mock.
    const baseFrom = dispenseFrom()
    const from = vi.fn((table: string) => {
      if (table === 'practitioners') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: SUPERVISOR, role: 'DOCTOR', org_id: 'org-1', kyc_status: 'ACTIVE', supervisor_pin_hash: PIN_HASH }, error: null }) }) }) }
      }
      return baseFrom(table)
    })
    const rpc = vi.fn((fn: string, args: any) => {
      if (fn === 'record_dispense_atomic') {
        captured = args
        return Promise.resolve({ data: { outcome: 'DISPENSED', dispenseId: args.p_dispense.id, prescriptionStatus: 'DISPENSED', status: 'completed', dispensedAt: input.whenHandedOver, reviewError: null }, error: null })
      }
      return Promise.resolve({ data: [{ chain_hash: 'h' }], error: null })
    })
    const caller = createCaller({ supabase: { from, rpc } as never, user: PHARM, headers: new Headers() })
    await caller.medication.recordDispense({
      ...input,
      overrideReasonCode: OverrideReasonCode.BENEFIT_OUTWEIGHS_RISK,
      overrideReason: 'benefit outweighs risk',
      supervisorAuth: { supervisorId: SUPERVISOR, supervisorPin: PIN },
    })
    expect(captured.p_has_override).toBe(true)
    // H-HUB-2: the review carries the SUPERVISOR's id, never the pharmacist's own.
    expect(captured.p_review.override_supervisor).toBe(SUPERVISOR)
    expect(captured.p_review.override_supervisor).not.toBe(PHARM.sub)
    expect(captured.p_review.override_supervisor_verified).toBe(true)
    expect(captured.p_review.status).toBe('PENDING')
  })
})

// ── Flow 4: lab.register (M-HUB-4 + M-HUB-7) ─────────────────────────────────
describe('atomic register_lab_atomic', () => {
  const LAB_TECH = { sub: 'auth-user-1', role: 'LAB_TECH' as const, sessionId: 's', orgId: null, facilityId: null, status: 'ACTIVE' }
  const validInput = { labName: 'Lab', licenseRef: 'LIC-1', accreditationRef: 'ACC-1', technicianCredentialRef: 'CRED-1' }

  function ctx(rpc: ReturnType<typeof vi.fn>) {
    return { supabase: { rpc } as never, user: LAB_TECH, headers: new Headers() }
  }

  it('SHAPE + M-HUB-7: passes the AUTH id to the RPC (which resolves practitioners.id internally)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { labId: 'lab-1' }, error: null })
    const caller = createCaller(ctx(rpc))
    const res = await caller.lab.register(validInput)
    expect(res).toEqual({ success: true, labId: 'lab-1', status: 'PENDING' })
    expect(rpc).toHaveBeenCalledWith('register_lab_atomic', expect.objectContaining({ p_auth_user_id: 'auth-user-1' }))
  })

  it('FAILURE INJECTION: technician-insert unique violation (23505) → CONFLICT, no orphan lab', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const caller = createCaller(ctx(rpc))
    await expect(caller.lab.register(validInput)).rejects.toMatchObject({ code: 'CONFLICT' })
    // Exactly one RPC call — no separate lab insert + compensating delete.
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('FAILURE INJECTION: no practitioner profile → PRECONDITION_FAILED', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'PRACTITIONER_NOT_FOUND' } })
    const caller = createCaller(ctx(rpc))
    await expect(caller.lab.register(validInput)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('FAILURE INJECTION: RPC crash → INTERNAL_SERVER_ERROR', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'crash' } })
    const caller = createCaller(ctx(rpc))
    await expect(caller.lab.register(validInput)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})

// ── M-HUB-7: self-service reads resolve practitioners.id from the auth id ────
// Before Story 61.3 these filtered practitioner columns by ctx.user.sub (the
// AUTH id), so they returned nothing for every real seeded practitioner. These
// tests seed a practitioner whose auth_user_id = the caller's sub and prove the
// reads now return that practitioner's data.
describe('M-HUB-7 self-service reads (auth_user_id → practitioners.id)', () => {
  const AUTH_SUB = 'auth-user-9'
  const PRACTITIONER_ID = '99999999-9999-4999-8999-999999999999'
  const LAB_TECH = { sub: AUTH_SUB, role: 'LAB_TECH' as const, sessionId: 's', orgId: 'org-1', facilityId: null, status: 'ACTIVE' }

  // labRestrictedProcedure resolves lab context via lab_technicians joined on
  // practitioners.auth_user_id — provide a matching seeded technician row.
  function techJoinRow() {
    return { id: 'tech-rec', lab_id: 'lab-1', lab_role: 'LAB_TECH', labs: { id: 'lab-1', status: 'ACTIVE' }, practitioners: { auth_user_id: AUTH_SUB } }
  }

  it('getMyRole: resolves the technician via the practitioners.auth_user_id join and returns the labRole', async () => {
    let sawAuthJoinFilter = false
    const from = vi.fn((table: string) => {
      if (table === 'lab_technicians') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              // The router now filters on the joined practitioners.auth_user_id.
              if (col === 'practitioners.auth_user_id') sawAuthJoinFilter = true
              return {
                single: vi.fn().mockResolvedValue({ data: techJoinRow(), error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: { lab_role: 'SENIOR_TECH', labs: { status: 'ACTIVE' }, practitioners: { auth_user_id: AUTH_SUB } }, error: null }),
              }
            }),
          }),
        }
      }
      return {}
    })
    const caller = createCaller({ supabase: { from } as never, user: LAB_TECH, headers: new Headers() })
    const res = await caller.lab.getMyRole()
    expect(res).toEqual({ labRole: 'SENIOR_TECH' })
    expect(sawAuthJoinFilter).toBe(true)
  })

  it('getMyCertifications: resolves practitioners.id from auth_user_id and returns that practitioner\'s progress', async () => {
    let certFilteredBy: string | null = null
    const from = vi.fn((table: string) => {
      if (table === 'lab_technicians') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: techJoinRow(), error: null }) }) }) }
      }
      if (table === 'practitioners') {
        // The self-service read resolves practitioners.id from the auth id.
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PRACTITIONER_ID }, error: null }) }) }) }
      }
      if (table === 'certification_progress') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              certFilteredBy = val
              return { order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 'cp-1', pathway_id: 'pw-1', milestone_index: 0, status: 'APPROVED', certification_pathways: { id: 'pw-1', name: 'Path', milestones: [{ title: 'M0', type: 'T', required_count: 1 }], status: 'ACTIVE' } }], error: null }) }) }
            }),
          }),
        }
      }
      return { select: vi.fn() }
    })
    const caller = createCaller({ supabase: { from } as never, user: LAB_TECH, headers: new Headers() })
    const res = await caller.lab.getMyCertifications()
    // The query filtered on the RESOLVED practitioners.id, not the auth sub.
    expect(certFilteredBy).toBe(PRACTITIONER_ID)
    expect(certFilteredBy).not.toBe(AUTH_SUB)
    expect(res.pathways).toHaveLength(1)
    expect(res.pathways[0]!.pathwayId).toBe('pw-1')
  })

  it('getMyCertifications: returns empty pathways when the caller has no practitioner profile', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'lab_technicians') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: techJoinRow(), error: null }) }) }) }
      }
      if (table === 'practitioners') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      }
      return { select: vi.fn() }
    })
    const caller = createCaller({ supabase: { from } as never, user: LAB_TECH, headers: new Headers() })
    const res = await caller.lab.getMyCertifications()
    expect(res).toEqual({ pathways: [] })
  })
})
