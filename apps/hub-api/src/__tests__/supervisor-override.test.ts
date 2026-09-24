import { describe, it, expect } from 'vitest'
import {
  verifySupervisorOverride,
  hashSupervisorPin,
  deriveOverrideSeverity,
} from '../services/supervisor-override'

// ---------------------------------------------------------------------------
// Minimal supabase mock: only practitioners.select().eq().maybeSingle() is used.
// ---------------------------------------------------------------------------
function mockSupabaseWithSupervisor(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as never
}

const PHARMACIST_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const SUPERVISOR_ID = 'bbbbbbbb-0000-4000-8000-000000000002'
const ORG = 'org-1'
const PIN = '4321'

const validSupervisorRow = {
  id: SUPERVISOR_ID,
  role: 'DOCTOR',
  org_id: ORG,
  kyc_status: 'ACTIVE',
  supervisor_pin_hash: hashSupervisorPin(PIN),
}

describe('verifySupervisorOverride', () => {
  it('rejects self-supervision (supervisor id === dispensing pharmacist) before any lookup', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(validSupervisorRow),
      { supervisorId: PHARMACIST_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'SELF_SUPERVISION' })
  })

  it('accepts a valid distinct supervisor-capable practitioner in the same org with a correct PIN', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(validSupervisorRow),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: true, supervisorId: SUPERVISOR_ID })
  })

  it('rejects a supervisor not found', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(null),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'SUPERVISOR_NOT_FOUND' })
  })

  it('rejects a non-supervisor-capable role (another PHARMACIST)', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor({ ...validSupervisorRow, role: 'PHARMACIST' }),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'NOT_SUPERVISOR_CAPABLE' })
  })

  it('rejects a supervisor from a different org', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor({ ...validSupervisorRow, org_id: 'org-2' }),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'CROSS_ORG' })
  })

  it('rejects when the dispensing pharmacist has no org', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(validSupervisorRow),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      null,
    )
    expect(res).toEqual({ ok: false, code: 'CROSS_ORG' })
  })

  it('rejects an inactive supervisor account', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor({ ...validSupervisorRow, kyc_status: 'SUSPENDED' }),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'SUPERVISOR_INACTIVE' })
  })

  it('rejects when the supervisor has no PIN configured', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor({ ...validSupervisorRow, supervisor_pin_hash: null }),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'NO_PIN_SET' })
  })

  it('rejects an incorrect PIN', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(validSupervisorRow),
      { supervisorId: SUPERVISOR_ID, supervisorPin: '0000' },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'INVALID_PIN' })
  })

  it('maps a lookup error to LOOKUP_ERROR (never a silent accept)', async () => {
    const res = await verifySupervisorOverride(
      mockSupabaseWithSupervisor(null, { code: 'PGRST000' }),
      { supervisorId: SUPERVISOR_ID, supervisorPin: PIN },
      PHARMACIST_ID,
      ORG,
    )
    expect(res).toEqual({ ok: false, code: 'LOOKUP_ERROR' })
  })
})

describe('deriveOverrideSeverity', () => {
  it('a BLOCKED server status is always CONTRAINDICATED regardless of code', () => {
    expect(deriveOverrideSeverity('BLOCKED', 'BENEFIT_OUTWEIGHS_RISK')).toBe('CONTRAINDICATED')
  })
  it('maps allergy-tolerated to ALLERGY_MATCH', () => {
    expect(deriveOverrideSeverity('UNAVAILABLE', 'ALLERGY_PREVIOUSLY_TOLERATED')).toBe('ALLERGY_MATCH')
  })
  it('maps benefit/no-alternative to MAJOR', () => {
    expect(deriveOverrideSeverity('UNAVAILABLE', 'BENEFIT_OUTWEIGHS_RISK')).toBe('MAJOR')
    expect(deriveOverrideSeverity('WARNING', 'NO_ALTERNATIVE_AVAILABLE')).toBe('MAJOR')
  })
  it('defaults to MODERATE for other/unknown', () => {
    expect(deriveOverrideSeverity('UNAVAILABLE', 'OTHER')).toBe('MODERATE')
    expect(deriveOverrideSeverity(null, undefined)).toBe('MODERATE')
  })
})
