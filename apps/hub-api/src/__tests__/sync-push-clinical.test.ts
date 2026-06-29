import { describe, it, expect, vi, beforeEach } from 'vitest'

// Field-encryption keys (db.toRow is identity-mocked below, but importing the
// router pulls in field-encryption which validates env at module load).
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// db.toRow identity → asserted rows keep the mapper's camelCase keys.
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    toRowRaw: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRowRaw: (d: Record<string, unknown>) => d,
    fromRows: (d: Record<string, unknown>[]) => d,
  },
}))

const mockAuditEmit = vi.fn().mockResolvedValue({})
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'
const ENCOUNTER_UUID = '66666666-6666-6666-6666-666666666666'
const PRACT_UUID = '77777777-7777-7777-7777-777777777777'
const ORG_UUID = '269c2a80-c6ee-4c69-90ad-434afc77f027'

const TEST_USER = {
  sub: PRACT_UUID,
  role: 'DOCTOR',
  sessionId: 'sess-1',
  orgId: ORG_UUID,
  facilityId: null,
  status: null,
}

interface UpsertCall { table: string; row: Record<string, unknown> }

/** Supabase mock: conflict-detection SELECT returns no existing row; upsert is captured. */
function makeSupabase(upserts: UpsertCall[]) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upserts.push({ table, row })
        return Promise.resolve({ error: null })
      },
    }),
    rpc: vi.fn().mockResolvedValue({ data: [{ chain_hash: 'h' }], error: null }),
  } as never
}

function encounterOp() {
  return {
    resourceType: 'Encounter',
    resourceId: ENCOUNTER_UUID,
    action: 'create' as const,
    hlcTimestamp: 'hlc-1',
    payload: JSON.stringify({
      id: ENCOUNTER_UUID,
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      participant: [{ individual: { reference: `Practitioner/${PRACT_UUID}` } }],
      period: { start: '2026-06-25T10:00:00.000Z' },
      _ultranos: { isOfflineCreated: true, createdAt: '2026-06-25T10:00:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:00:00.000Z', versionId: '1' },
    }),
  }
}

function soapOp() {
  return {
    resourceType: 'ClinicalImpression',
    resourceId: '88888888-8888-8888-8888-888888888888',
    action: 'update' as const,
    hlcTimestamp: 'hlc-2',
    payload: JSON.stringify({
      id: '88888888-8888-8888-8888-888888888888',
      encounterId: ENCOUNTER_UUID,
      subjective: 'productive cough x3 days',
      objective: 'crackles left base',
      assessment: 'community-acquired pneumonia',
      plan: 'amoxicillin 500mg TID',
      assessorRef: `Practitioner/${PRACT_UUID}`,
      hlcTimestamp: 'hlc-2',
      createdAt: '2026-06-25T10:05:00.000Z',
    }),
  }
}

function observationOp() {
  return {
    resourceType: 'Observation',
    resourceId: '99999999-9999-9999-9999-999999999999',
    action: 'create' as const,
    hlcTimestamp: 'hlc-3',
    payload: JSON.stringify({
      id: '99999999-9999-9999-9999-999999999999',
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }] },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      encounter: { reference: `Encounter/${ENCOUNTER_UUID}` },
      effectiveDateTime: '2026-06-25T10:05:00.000Z',
      valueQuantity: { value: 72, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
      _ultranos: { isOfflineCreated: true, createdAt: '2026-06-25T10:05:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:05:00.000Z', versionId: '1' },
    }),
  }
}

function allergyOp() {
  return {
    resourceType: 'AllergyIntolerance',
    resourceId: 'a1a1a1a1-0000-0000-0000-000000000001',
    action: 'create' as const,
    hlcTimestamp: 'hlc-allergy',
    payload: JSON.stringify({
      id: 'a1a1a1a1-0000-0000-0000-000000000001',
      resourceType: 'AllergyIntolerance',
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      type: 'allergy',
      criticality: 'high',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '7980', display: 'Penicillin' }], text: 'Penicillin' },
      patient: { reference: `Patient/${PATIENT_UUID}` },
      recorder: { reference: `Practitioner/${PRACT_UUID}` },
      recordedDate: '2026-06-25T10:00:00.000Z',
      _ultranos: { substanceFreeText: 'rash', isOfflineCreated: true, recordedByRole: 'DOCTOR', createdAt: '2026-06-25T10:00:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:00:00.000Z', versionId: '1' },
    }),
  }
}

function conditionOp() {
  return {
    resourceType: 'Condition',
    resourceId: 'c1c1c1c1-0000-0000-0000-000000000001',
    action: 'create' as const,
    hlcTimestamp: 'hlc-cond',
    payload: JSON.stringify({
      id: 'c1c1c1c1-0000-0000-0000-000000000001',
      resourceType: 'Condition',
      clinicalStatus: { coding: [{ code: 'active' }] },
      category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J18.9', display: 'Pneumonia' }], text: 'Pneumonia' },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      encounter: { reference: `Encounter/${ENCOUNTER_UUID}` },
      recorder: { reference: `Practitioner/${PRACT_UUID}` },
      recordedDate: '2026-06-25T10:00:00.000Z',
      _ultranos: { isOfflineCreated: true, createdAt: '2026-06-25T10:00:00.000Z', diagnosisRank: 'primary' },
      meta: { lastUpdated: '2026-06-25T10:00:00.000Z', versionId: '1' },
    }),
  }
}

function medicationRequestOp() {
  return {
    resourceType: 'MedicationRequest',
    resourceId: 'd1d1d1d1-0000-0000-0000-000000000001',
    action: 'create' as const,
    hlcTimestamp: 'hlc-rx',
    payload: JSON.stringify({
      id: 'd1d1d1d1-0000-0000-0000-000000000001',
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: { coding: [{ system: 'urn:ultranos:formulary', code: 'amox-500', display: 'Amoxicillin' }], text: 'Amoxicillin 500mg' },
      subject: { reference: `Patient/${PATIENT_UUID}` },
      encounter: { reference: `Encounter/${ENCOUNTER_UUID}` },
      requester: { reference: `Practitioner/${PRACT_UUID}` },
      authoredOn: '2026-06-25T10:05:00.000Z',
      dosageInstruction: [{ text: '1 tablet BID for 7 days' }],
      dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
      _ultranos: { prescriptionStatus: 'PENDING_FULFILLMENT', interactionCheckResult: 'CLEAR', isOfflineCreated: true, createdAt: '2026-06-25T10:05:00.000Z' },
      meta: { lastUpdated: '2026-06-25T10:05:00.000Z', versionId: '1' },
    }),
  }
}

describe('sync.push — clinical resources', () => {
  const createCaller = createCallerFactory(appRouter)

  beforeEach(() => { vi.clearAllMocks() })

  it('writes an Encounter into the encounters table with org_id and mapped columns', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [encounterOp()] })

    expect(results[0]).toEqual({ resourceId: ENCOUNTER_UUID, success: true })
    expect(upserts).toHaveLength(1)
    expect(upserts[0]!.table).toBe('encounters')
    const row = upserts[0]!.row
    expect(row.subjectId).toBe(PATIENT_UUID)
    expect(row.classSystem).toBe('http://terminology.hl7.org/CodeSystem/v3-ActCode')
    expect(row.orgId).toBe(ORG_UUID)        // Layer 2: stamped from ctx
    expect(row.hlcTimestamp).toBe('hlc-1')
  })

  it('writes a SOAP note mapping client fields (subjective/assessorRef) to soap_* columns', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [soapOp()] })

    expect(results[0]!.success).toBe(true)
    expect(upserts[0]!.table).toBe('soap_ledger')
    const row = upserts[0]!.row
    // Regression guard: note text must NOT be null (the original field-name bug)
    expect(row.soapSubjective).toBe('productive cough x3 days')
    expect(row.soapPlan).toBe('amoxicillin 500mg TID')
    expect(row.practitionerId).toBe(PRACT_UUID)   // stripped from `Practitioner/<uuid>`
    expect(row.orgId).toBeUndefined()             // soap_ledger has no org_id column
  })

  it('writes an Observation (vitals) mapping the FHIR shape to observations columns', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [observationOp()] })

    expect(results[0]!.success).toBe(true)
    expect(upserts[0]!.table).toBe('observations')
    const row = upserts[0]!.row
    expect(row.subjectId).toBe(PATIENT_UUID)
    expect(row.encounterId).toBe(ENCOUNTER_UUID)
    expect(row.valueQuantity).toMatchObject({ value: 72, unit: 'kg' })
    expect(row.orgId).toBe(ORG_UUID)
  })

  it('writes an AllergyIntolerance with bare-UUID patient_ref and substance columns (Tier-1)', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [allergyOp()] })

    expect(results[0]!.success).toBe(true)
    expect(upserts[0]!.table).toBe('allergy_intolerances')
    const row = upserts[0]!.row
    expect(row.clinicalStatusCode).toBe('active')
    expect(row.criticality).toBe('high')
    expect(row.substanceText).toBe('Penicillin')
    expect(row.patientRef).toBe(PATIENT_UUID)        // bare UUID → pull filter matches
    expect(row.orgId).toBeUndefined()                // allergy_intolerances has no org_id
  })

  it('writes a Condition into the conditions table (org-scoped, jsonb code)', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [conditionOp()] })

    expect(results[0]!.success).toBe(true)
    expect(upserts[0]!.table).toBe('conditions')
    const row = upserts[0]!.row
    expect(row.subjectId).toBe(PATIENT_UUID)
    expect(row.encounterId).toBe(ENCOUNTER_UUID)
    expect(row.code).toMatchObject({ text: 'Pneumonia' })  // jsonb passthrough
    expect(row.diagnosisRank).toBe('primary')
    expect(row.orgId).toBe(ORG_UUID)
  })

  it('writes a MedicationRequest to medication_requests (stringified codeable_concept, org-scoped)', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({ supabase: makeSupabase(upserts), user: TEST_USER, headers: new Headers() })

    const { results } = await caller.sync.push({ operations: [medicationRequestOp()] })

    expect(results[0]!.success).toBe(true)
    expect(upserts[0]!.table).toBe('medication_requests')   // regression: was the nonexistent 'medications'
    const row = upserts[0]!.row
    // text column → JSON-stringified, not an object (would error on a text column)
    expect(typeof row.medicationCodeableConcept).toBe('string')
    expect(JSON.parse(row.medicationCodeableConcept as string)).toMatchObject({ text: 'Amoxicillin 500mg' })
    expect(row.medicationDisplay).toBe('Amoxicillin')
    expect(row.medicationText).toBe('Amoxicillin 500mg')
    expect(row.subjectReference).toBe(PATIENT_UUID)
    expect(row.requesterId).toBe(PRACT_UUID)
    expect(row.interactionCheck).toBe('CLEAR')
    expect(row.orgId).toBe(ORG_UUID)
  })

  it('rejects an org-scoped write when the caller has no org context (no silent NULL)', async () => {
    const upserts: UpsertCall[] = []
    const caller = createCaller({
      supabase: makeSupabase(upserts),
      user: { ...TEST_USER, orgId: null },
      headers: new Headers(),
    })

    const { results } = await caller.sync.push({ operations: [encounterOp()] })

    expect(results[0]).toEqual({ resourceId: ENCOUNTER_UUID, success: false, error: 'MISSING_ORG_CONTEXT' })
    expect(upserts).toHaveLength(0)   // never attempted the write
  })
})
