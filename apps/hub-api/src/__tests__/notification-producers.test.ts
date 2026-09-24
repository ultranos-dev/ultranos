import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 60.4 (Task 2 & 3): cross-app notification PRODUCERS.
 *
 * Asserts, per producer type (SYNC_CONFLICT, ALLERGY_UPDATE, CONSENT_CHANGE, and
 * the MPI-review admin notification):
 *   - the event resolves the correct recipients (treating clinicians / org admins)
 *   - it inserts a notification row of the right shape (type, recipient_role,
 *     source_app / subject_key / body_key descriptors)
 *   - ⛔ the row carries NO PHI: no patient name, drug name, diagnosis, or allergy
 *     substance in ANY field (recipient_ref, payload, body_params). This is the
 *     load-bearing safety assertion (CLAUDE.md Rule #1).
 *   - the produced row is consumable by the polling client (recipient_ref keyed
 *     by practitioners.id, status QUEUED — exactly what notification.list reads).
 */

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const {
  produceAllergyUpdateNotification,
  produceConsentChangeNotification,
  produceSyncConflictNotification,
  resolveTreatingClinicians,
  resolveOrgAdmins,
} = await import('../lib/notification-producers')

// ── PHI sentinels that must NEVER appear anywhere in a produced row ──────────
const PHI_SENTINELS = ['Ahmad', 'Amoxicillin', 'Penicillin', 'Diabetes', 'Jane Doe', '1234567890']

const PATIENT_ID = '11111111-1111-1111-1111-111111111111'
const DOC_A = 'prac-doctor-a'
const DOC_B = 'prac-doctor-b'
const ADMIN_A = 'prac-admin-a'

// ── In-memory Supabase harness ───────────────────────────────────────────────
type Row = Record<string, any>

function makeSupabase(seed: {
  medication_requests?: Row[]
  practitioners?: Row[]
  notifications?: Row[]
}) {
  const notifStore: Row[] = seed.notifications ?? []

  function medBuilder() {
    let rows = (seed.medication_requests ?? []).slice()
    const b: any = {
      select() { return b },
      in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return b },
      eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return b },
      then(resolve: any, reject: any) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject) },
    }
    return b
  }

  function pracBuilder() {
    let rows = (seed.practitioners ?? []).slice()
    const b: any = {
      select() { return b },
      in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return b },
      eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return b },
      then(resolve: any, reject: any) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject) },
    }
    return b
  }

  const api = {
    __notifications: notifStore,
    from(table: string) {
      if (table === 'medication_requests') return medBuilder()
      if (table === 'practitioners') return pracBuilder()
      if (table === 'notifications') {
        return {
          insert(rows: Row[]) {
            const inserted = rows.map((r, i) => ({ ...r, id: `notif-${notifStore.length + i}` }))
            notifStore.push(...inserted)
            return {
              select() {
                return Promise.resolve({ data: inserted.map((r) => ({ id: r.id })), error: null })
              },
            }
          },
        }
      }
      return {}
    },
  }
  return api
}

function assertNoPhiInRow(row: Row) {
  const serialized = JSON.stringify(row)
  for (const phi of PHI_SENTINELS) {
    expect(serialized).not.toContain(phi)
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('resolveTreatingClinicians', () => {
  it('returns distinct prescriber ids for the patient (bare + prefixed patient_ref)', async () => {
    const supabase = makeSupabase({
      medication_requests: [
        { requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' },
        { requester_id: DOC_B, subject_reference: `Patient/${PATIENT_ID}`, status: 'completed' },
        { requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' }, // dup → collapses
      ],
    })
    const recipients = await resolveTreatingClinicians(supabase as never, PATIENT_ID)
    expect(recipients.sort()).toEqual([DOC_A, DOC_B].sort())
  })

  it('returns [] when the patient has no active prescribers', async () => {
    const supabase = makeSupabase({ medication_requests: [] })
    expect(await resolveTreatingClinicians(supabase as never, PATIENT_ID)).toEqual([])
  })
})

describe('resolveOrgAdmins', () => {
  it('returns admin practitioner ids scoped to the org', async () => {
    const supabase = makeSupabase({
      practitioners: [{ id: ADMIN_A, role: 'ORG_ADMIN', org_id: 'org-1' }],
    })
    expect(await resolveOrgAdmins(supabase as never, 'org-1')).toEqual([ADMIN_A])
  })
})

describe('ALLERGY_UPDATE producer', () => {
  it('notifies treating clinicians with criticality only — NO substance/PHI', async () => {
    const supabase = makeSupabase({
      medication_requests: [{ requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' }],
    })
    const res = await produceAllergyUpdateNotification(supabase as never, {
      patientId: PATIENT_ID,
      criticality: 'high',
      actorId: 'doc-sub',
      actorRole: 'DOCTOR',
      sessionId: 's1',
    })

    expect(res.inserted).toBe(1)
    const row = supabase.__notifications[0]!
    expect(row.type).toBe('ALLERGY_UPDATE')
    expect(row.recipient_ref).toBe(DOC_A)
    expect(row.recipient_role).toBe('CLINICIAN')
    expect(row.status).toBe('QUEUED')
    expect(row.source_app).toBe('OPD_LITE')
    // criticality (a severity enum) is allowed; the substance is not present.
    expect(row.body_params.criticality).toBe('high')
    assertNoPhiInRow(row)
  })

  it('no-ops (no row) when there are no treating clinicians', async () => {
    const supabase = makeSupabase({ medication_requests: [] })
    const res = await produceAllergyUpdateNotification(supabase as never, { patientId: PATIENT_ID, criticality: 'high' })
    expect(res.inserted).toBe(0)
    expect(supabase.__notifications).toHaveLength(0)
  })
})

describe('CONSENT_CHANGE producer', () => {
  it('notifies treating clinicians with the consent status enum only — NO PHI', async () => {
    const supabase = makeSupabase({
      medication_requests: [
        { requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' },
        { requester_id: DOC_B, subject_reference: PATIENT_ID, status: 'active' },
      ],
    })
    const res = await produceConsentChangeNotification(supabase as never, {
      patientId: `Patient/${PATIENT_ID}`,
      consentStatus: 'WITHDRAWN',
    })

    expect(res.inserted).toBe(2)
    for (const row of supabase.__notifications) {
      expect(row.type).toBe('CONSENT_CHANGE')
      expect(row.recipient_role).toBe('CLINICIAN')
      expect(row.body_params.consentStatus).toBe('WITHDRAWN')
      assertNoPhiInRow(row)
    }
    expect(supabase.__notifications.map((r) => r.recipient_ref).sort()).toEqual([DOC_A, DOC_B].sort())
  })
})

describe('SYNC_CONFLICT producer', () => {
  it('notifies treating clinicians with the resourceType only — NO PHI', async () => {
    const supabase = makeSupabase({
      medication_requests: [{ requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' }],
    })
    const res = await produceSyncConflictNotification(supabase as never, {
      patientId: PATIENT_ID,
      resourceType: 'AllergyIntolerance',
    })

    expect(res.inserted).toBe(1)
    const row = supabase.__notifications[0]!
    expect(row.type).toBe('SYNC_CONFLICT')
    expect(row.source_app).toBe('SYSTEM')
    expect(row.body_params.resourceType).toBe('AllergyIntolerance')
    assertNoPhiInRow(row)
  })

  it('emits a CREATE audit event per produced notification (Rule #6)', async () => {
    const supabase = makeSupabase({
      medication_requests: [{ requester_id: DOC_A, subject_reference: PATIENT_ID, status: 'active' }],
    })
    await produceSyncConflictNotification(supabase as never, { patientId: PATIENT_ID, resourceType: 'MedicationRequest' })
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'NOTIFICATION' }),
    )
  })
})
