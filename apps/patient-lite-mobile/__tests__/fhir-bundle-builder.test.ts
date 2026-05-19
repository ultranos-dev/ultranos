/**
 * Tests for FHIR R4 Bundle builder — Story 18.8
 *
 * AC #2: All resource types included in output
 * AC #3: Valid FHIR R4 Bundle structure
 * AC #4: Each entry has fullUrl (URN) + resource
 * AC #10: Bundle meta with lastUpdated + ultranos tag
 */
import { buildPatientBundle, countResourceTypes, type FhirBundle } from '@/data/fhir-bundle-builder'

// Mock DB that tracks queries
function createMockDb(data: {
  patientProfile?: { id: string; data: string; updated_at: string } | null
  medicalHistory?: { id: string; patient_id: string; resource_type: string; data: string; updated_at: string }[]
  consents?: { id: string; patient_id: string; category: string; status: string; data: string; updated_at: string }[]
}) {
  return {
    getFirstAsync: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('patient_profiles')) {
        return data.patientProfile ?? null
      }
      return null
    }),
    getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('medical_history')) {
        const resourceType = (params as string[])?.[0]
        return (data.medicalHistory ?? []).filter(
          (r) => r.resource_type === resourceType,
        )
      }
      if (sql.includes('consents')) {
        return data.consents ?? []
      }
      return []
    }),
  } as any
}

const MOCK_PATIENT_DATA = JSON.stringify({
  id: 'patient-001',
  resourceType: 'Patient',
  name: [{ given: ['Fatima'], family: 'Al-Rashid' }],
  gender: 'female',
  birthDate: '1990-03-15',
  birthYearOnly: false,
  _ultranos: { nameLocal: 'فاطمة', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  meta: { lastUpdated: '2026-04-28T10:00:00Z' },
})

const MOCK_ENCOUNTER_DATA = JSON.stringify({
  id: 'enc-001',
  resourceType: 'Encounter',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  subject: { reference: 'Patient/patient-001' },
  period: { start: '2026-04-01T09:00:00Z' },
  _ultranos: { isOfflineCreated: false, hlcTimestamp: '0:0:node1', createdAt: '2026-04-01T09:00:00Z' },
  meta: { lastUpdated: '2026-04-01T09:00:00Z' },
})

const MOCK_MED_REQUEST_DATA = JSON.stringify({
  id: 'med-001',
  resourceType: 'MedicationRequest',
  status: 'active',
  intent: 'order',
  medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1049502', display: 'Amoxicillin 500mg' }] },
  subject: { reference: 'Patient/patient-001' },
  requester: { reference: 'Practitioner/prac-001' },
  authoredOn: '2026-04-01T10:00:00Z',
  _ultranos: { prescriptionStatus: 'ACTIVE', interactionCheckResult: 'CLEAR', isOfflineCreated: false, hlcTimestamp: '0:0:node1', createdAt: '2026-04-01T10:00:00Z' },
  meta: { lastUpdated: '2026-04-01T10:00:00Z' },
})

const MOCK_ALLERGY_DATA = JSON.stringify({
  id: 'allergy-001',
  resourceType: 'AllergyIntolerance',
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
  type: 'allergy',
  criticality: 'high',
  code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }] },
  patient: { reference: 'Patient/patient-001' },
  _ultranos: { createdAt: '2026-04-01T00:00:00Z', recordedByRole: 'physician', isOfflineCreated: false, hlcTimestamp: '0:0:node1' },
  meta: { lastUpdated: '2026-04-01T00:00:00Z' },
})

const MOCK_OBSERVATION_DATA = JSON.stringify({
  id: 'obs-001',
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
  subject: { reference: 'Patient/patient-001' },
  encounter: { reference: 'Encounter/enc-001' },
  effectiveDateTime: '2026-04-01T09:15:00Z',
  valueQuantity: { value: 72, unit: 'beats/minute' },
  _ultranos: { isOfflineCreated: false, hlcTimestamp: '0:0:node1', createdAt: '2026-04-01T09:15:00Z' },
  meta: { lastUpdated: '2026-04-01T09:15:00Z' },
})

const MOCK_CONDITION_DATA = JSON.stringify({
  id: 'cond-001',
  resourceType: 'Condition',
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'J06.9', display: 'Acute upper respiratory infection' }] },
  subject: { reference: 'Patient/patient-001' },
  encounter: { reference: 'Encounter/enc-001' },
  _ultranos: { isOfflineCreated: false, hlcTimestamp: '0:0:node1', createdAt: '2026-04-01T00:00:00Z', diagnosisRank: 'primary' },
  meta: { lastUpdated: '2026-04-01T00:00:00Z' },
})

const MOCK_MED_STATEMENT_DATA = JSON.stringify({
  id: 'medstmt-001',
  resourceType: 'MedicationStatement',
  status: 'active',
  medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1049502', display: 'Amoxicillin 500mg' }] },
  subject: { reference: 'Patient/patient-001' },
  dateAsserted: '2026-04-01T10:00:00Z',
  _ultranos: { createdAt: '2026-04-01T10:00:00Z', isOfflineCreated: false, hlcTimestamp: '0:0:node1' },
  meta: { lastUpdated: '2026-04-01T10:00:00Z' },
})

const MOCK_CONSENT_DATA = JSON.stringify({
  id: 'consent-001',
  resourceType: 'Consent',
  status: 'active',
  scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
  category: ['TREATMENT'],
  patient: { reference: 'Patient/patient-001' },
  dateTime: '2026-01-01T00:00:00Z',
  provision: {},
  _ultranos: { grantorId: 'patient-001', grantorRole: 'PATIENT', purpose: 'TREATMENT', validFrom: '2026-01-01T00:00:00Z', consentVersion: '1.0', auditHash: 'hash123', createdAt: '2026-01-01T00:00:00Z' },
  meta: { lastUpdated: '2026-01-01T00:00:00Z' },
})

describe('buildPatientBundle', () => {
  it('produces a valid FHIR R4 Bundle structure (AC #3)', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
    })

    const bundle = await buildPatientBundle(db)

    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('collection')
    expect(bundle.timestamp).toBeDefined()
    expect(typeof bundle.timestamp).toBe('string')
    expect(bundle.entry).toBeInstanceOf(Array)
  })

  it('includes bundle meta with lastUpdated and ultranos tag (AC #10)', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
    })

    const bundle = await buildPatientBundle(db)

    expect(bundle.meta.lastUpdated).toBeDefined()
    expect(bundle.meta.tag).toEqual([
      { system: 'ultranos', code: 'patient-export' },
    ])
  })

  it('each entry has fullUrl (URN) and resource (AC #4)', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
      medicalHistory: [
        { id: 'enc-001', patient_id: 'patient-001', resource_type: 'Encounter', data: MOCK_ENCOUNTER_DATA, updated_at: '2026-04-01T09:00:00Z' },
      ],
    })

    const bundle = await buildPatientBundle(db)

    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:.+/)
      expect(entry.resource).toBeDefined()
      expect(entry.resource.resourceType).toBeDefined()
    }
  })

  it('includes all resource types in output (AC #2)', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
      medicalHistory: [
        { id: 'enc-001', patient_id: 'patient-001', resource_type: 'Encounter', data: MOCK_ENCOUNTER_DATA, updated_at: '2026-04-01T09:00:00Z' },
        { id: 'med-001', patient_id: 'patient-001', resource_type: 'MedicationRequest', data: MOCK_MED_REQUEST_DATA, updated_at: '2026-04-01T10:00:00Z' },
        { id: 'allergy-001', patient_id: 'patient-001', resource_type: 'AllergyIntolerance', data: MOCK_ALLERGY_DATA, updated_at: '2026-04-01T00:00:00Z' },
        { id: 'obs-001', patient_id: 'patient-001', resource_type: 'Observation', data: MOCK_OBSERVATION_DATA, updated_at: '2026-04-01T09:15:00Z' },
        { id: 'cond-001', patient_id: 'patient-001', resource_type: 'Condition', data: MOCK_CONDITION_DATA, updated_at: '2026-04-01T00:00:00Z' },
        { id: 'medstmt-001', patient_id: 'patient-001', resource_type: 'MedicationStatement', data: MOCK_MED_STATEMENT_DATA, updated_at: '2026-04-01T10:00:00Z' },
      ],
      consents: [
        { id: 'consent-001', patient_id: 'patient-001', category: 'TREATMENT', status: 'active', data: MOCK_CONSENT_DATA, updated_at: '2026-01-01T00:00:00Z' },
      ],
    })

    const bundle = await buildPatientBundle(db)

    const resourceTypes = bundle.entry.map((e) => e.resource.resourceType)
    expect(resourceTypes).toContain('Patient')
    expect(resourceTypes).toContain('Encounter')
    expect(resourceTypes).toContain('MedicationRequest')
    expect(resourceTypes).toContain('MedicationStatement')
    expect(resourceTypes).toContain('AllergyIntolerance')
    expect(resourceTypes).toContain('Observation')
    expect(resourceTypes).toContain('Condition')
    expect(resourceTypes).toContain('Consent')
    expect(bundle.entry.length).toBe(8)
  })

  it('empty database produces a bundle with no entries', async () => {
    const db = createMockDb({
      patientProfile: null,
      medicalHistory: [],
      consents: [],
    })

    const bundle = await buildPatientBundle(db)

    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('collection')
    expect(bundle.entry).toHaveLength(0)
  })

  it('skips malformed JSON rows gracefully', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
      medicalHistory: [
        { id: 'bad-001', patient_id: 'patient-001', resource_type: 'Encounter', data: '{ invalid json', updated_at: '2026-04-01T00:00:00Z' },
        { id: 'enc-001', patient_id: 'patient-001', resource_type: 'Encounter', data: MOCK_ENCOUNTER_DATA, updated_at: '2026-04-01T09:00:00Z' },
      ],
    })

    const bundle = await buildPatientBundle(db)

    // Should have Patient + valid Encounter (malformed row skipped)
    expect(bundle.entry.length).toBe(2)
  })

  it('skips rows with mismatched resourceType', async () => {
    const wrongTypeData = JSON.stringify({
      id: 'wrong-001',
      resourceType: 'Observation', // stored under Encounter type
    })

    const db = createMockDb({
      patientProfile: null,
      medicalHistory: [
        { id: 'wrong-001', patient_id: 'patient-001', resource_type: 'Encounter', data: wrongTypeData, updated_at: '2026-04-01T00:00:00Z' },
      ],
    })

    const bundle = await buildPatientBundle(db)
    expect(bundle.entry.length).toBe(0)
  })

  it('calls progress callback during building', async () => {
    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
    })
    const onProgress = jest.fn()

    await buildPatientBundle(db, onProgress)

    expect(onProgress).toHaveBeenCalled()
    const calls = onProgress.mock.calls.map((c: string[]) => c[0])
    expect(calls.some((msg: string) => msg.includes('patient profile'))).toBe(true)
  })

  // Story 18.9 AC #8: FHIR export includes ALL medications including sensitive ones
  it('includes sensitive medications in the FHIR Bundle export (Story 18.9 AC #8)', async () => {
    const sensitiveMedData = JSON.stringify({
      id: 'med-sensitive-001',
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [
          { system: 'http://www.whocc.no/atc', code: 'J05AF01', display: 'Tenofovir' },
        ],
        text: 'Tenofovir 300mg',
      },
      subject: { reference: 'Patient/patient-001' },
      requester: { reference: 'Practitioner/prac-001' },
      authoredOn: '2026-04-15T10:00:00Z',
      _ultranos: { prescriptionStatus: 'ACTIVE', interactionCheckResult: 'CLEAR', isOfflineCreated: false, hlcTimestamp: '0:0:node1', createdAt: '2026-04-15T10:00:00Z' },
      meta: { lastUpdated: '2026-04-15T10:00:00Z' },
    })

    const db = createMockDb({
      patientProfile: { id: 'patient-001', data: MOCK_PATIENT_DATA, updated_at: '2026-04-28T10:00:00Z' },
      medicalHistory: [
        { id: 'med-001', patient_id: 'patient-001', resource_type: 'MedicationRequest', data: MOCK_MED_REQUEST_DATA, updated_at: '2026-04-01T10:00:00Z' },
        { id: 'med-sensitive-001', patient_id: 'patient-001', resource_type: 'MedicationRequest', data: sensitiveMedData, updated_at: '2026-04-15T10:00:00Z' },
      ],
    })

    const bundle = await buildPatientBundle(db)

    const medEntries = bundle.entry.filter((e) => e.resource.resourceType === 'MedicationRequest')
    expect(medEntries.length).toBe(2)

    // Verify sensitive medication is included with full data — no masking in export
    const sensitiveMed = medEntries.find((e) => (e.resource as any).id === 'med-sensitive-001')
    expect(sensitiveMed).toBeDefined()
    expect((sensitiveMed!.resource as any).medicationCodeableConcept.text).toBe('Tenofovir 300mg')

    // Verify no isSensitive flag in the FHIR Bundle (it's a UI concern)
    expect((sensitiveMed!.resource as any).isSensitive).toBeUndefined()
  })
})

describe('countResourceTypes', () => {
  it('counts resources by type correctly', () => {
    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: '2026-05-18T00:00:00Z',
      meta: { lastUpdated: '2026-05-18T00:00:00Z', tag: [{ system: 'ultranos', code: 'patient-export' }] },
      entry: [
        { fullUrl: 'urn:uuid:1', resource: { resourceType: 'Patient' } },
        { fullUrl: 'urn:uuid:2', resource: { resourceType: 'Encounter' } },
        { fullUrl: 'urn:uuid:3', resource: { resourceType: 'Encounter' } },
        { fullUrl: 'urn:uuid:4', resource: { resourceType: 'AllergyIntolerance' } },
      ],
    }

    const counts = countResourceTypes(bundle)

    expect(counts['Patient']).toBe(1)
    expect(counts['Encounter']).toBe(2)
    expect(counts['AllergyIntolerance']).toBe(1)
  })
})
