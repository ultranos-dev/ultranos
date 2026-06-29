import { describe, it, expect, vi } from 'vitest'

// sync-pull.ts runs side-effecting imports at module load — stub them so we can
// unit-test the pure reshapers in isolation.
vi.mock('@/lib/hub-url', () => ({ getHubTrpcUrl: () => 'http://test' }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/hlc', () => ({ hlc: { now: () => ({}) } }))
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ' },
}))
vi.mock('@ultranos/sync-engine', () => ({
  resolveConflict: vi.fn(),
  deserializeHlc: vi.fn(),
  compareHlc: vi.fn(),
}))

const {
  toFhirEncounter,
  toFhirAllergyIntolerance,
  toFhirObservation,
  toFhirCondition,
  toFhirMedicationRequest,
  toSoapLedgerEntry,
  toFhirMedicationStatement,
} = await import('../lib/sync-pull')

const PATIENT_ID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

describe('toFhirEncounter (Hub flat → FHIR)', () => {
  it('reconstructs subject.reference and _ultranos.hlcTimestamp so the local query matches', () => {
    const flat = {
      id: 'enc-1',
      subjectId: PATIENT_ID,
      status: 'in-progress',
      classSystem: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      classCode: 'AMB',
      periodStart: '2026-06-25T10:00:00Z',
      hlcTimestamp: '000001700000000:00000:node-1',
      lastUpdated: '2026-06-25T10:00:00Z',
    }
    const fhir = toFhirEncounter(flat) as Record<string, any>

    expect(fhir.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir.status).toBe('in-progress')
    expect(fhir._ultranos.hlcTimestamp).toBe('000001700000000:00000:node-1')
    expect(fhir.class.code).toBe('AMB')
    expect(fhir.period.start).toBe('2026-06-25T10:00:00Z')
  })

  it('passes through an already-nested encounter unchanged', () => {
    const nested = { id: 'enc-2', subject: { reference: `Patient/${PATIENT_ID}` }, status: 'finished' }
    expect(toFhirEncounter(nested)).toBe(nested)
  })
})

describe('toFhirAllergyIntolerance (Hub flat → FHIR)', () => {
  it('reconstructs patient.reference and keeps substance + active status', () => {
    const flat = {
      id: 'alg-1',
      patientRef: PATIENT_ID,
      clinicalStatusCode: 'active',
      substanceText: 'Penicillin',
      substanceFreeText: 'Penicillin',
      hlcTimestamp: '000001700000000:00000:node-1',
      metaLastUpdated: '2026-06-25T10:00:00Z',
    }
    const fhir = toFhirAllergyIntolerance(flat) as Record<string, any>

    expect(fhir.patient.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir.clinicalStatus.coding[0].code).toBe('active')
    expect(fhir.code.text).toBe('Penicillin')
    expect(fhir._ultranos.substanceFreeText).toBe('Penicillin')
  })

  it('passes through an already-nested allergy unchanged', () => {
    const nested = { id: 'alg-2', patient: { reference: `Patient/${PATIENT_ID}` } }
    expect(toFhirAllergyIntolerance(nested)).toBe(nested)
  })
})

const ENC_ID = 'enc-1'

describe('toFhirObservation (Hub flat → FHIR)', () => {
  it('reconstructs encounter.reference + subject.reference and keeps the value', () => {
    const fhir = toFhirObservation({
      id: 'obs-1',
      subjectId: PATIENT_ID,
      encounterId: ENC_ID,
      status: 'final',
      code: { text: 'Weight' },
      valueQuantity: { value: 75, unit: 'kg' },
      hlcTimestamp: 'hlc-1',
    }) as Record<string, any>

    expect(fhir.encounter.reference).toBe(`Encounter/${ENC_ID}`)
    expect(fhir.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir.valueQuantity.value).toBe(75)
    expect(fhir._ultranos.hlcTimestamp).toBe('hlc-1')
  })
})

describe('toFhirCondition (Hub flat → FHIR)', () => {
  it('reconstructs encounter.reference and preserves diagnosisRank for the index', () => {
    const fhir = toFhirCondition({
      id: 'cond-1',
      subjectId: PATIENT_ID,
      encounterId: ENC_ID,
      code: { text: 'Acute Gastritis' },
      diagnosisRank: 1,
      hlcTimestamp: 'hlc-1',
    }) as Record<string, any>

    expect(fhir.encounter.reference).toBe(`Encounter/${ENC_ID}`)
    expect(fhir.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir._ultranos.diagnosisRank).toBe(1)
    expect(fhir.code.text).toBe('Acute Gastritis')
  })
})

describe('toFhirMedicationRequest (Hub flat → FHIR)', () => {
  it('reconstructs references, parses the JSON CodeableConcept, and keeps dosage', () => {
    const fhir = toFhirMedicationRequest({
      id: 'rx-1',
      subjectReference: PATIENT_ID,
      encounterReference: ENC_ID,
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: JSON.stringify({ text: 'Ibuprofen 400mg', coding: [{ code: 'MED1' }] }),
      medicationText: 'Ibuprofen 400mg',
      dosageInstruction: [{ text: '1 tablet 3x daily' }],
      hlcTimestamp: 'hlc-1',
    }) as Record<string, any>

    expect(fhir.encounter.reference).toBe(`Encounter/${ENC_ID}`)
    expect(fhir.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir.medicationCodeableConcept.text).toBe('Ibuprofen 400mg')
    expect(fhir.dosageInstruction[0].text).toBe('1 tablet 3x daily')
  })

  it('falls back to medicationText when the CodeableConcept JSON is missing', () => {
    const fhir = toFhirMedicationRequest({
      id: 'rx-2',
      subjectReference: PATIENT_ID,
      medicationText: 'Amoxicillin 500mg',
    }) as Record<string, any>
    expect(fhir.medicationCodeableConcept.text).toBe('Amoxicillin 500mg')
  })
})

describe('toSoapLedgerEntry (Hub flat → local ledger)', () => {
  it('renames soap_* fields and keeps flat encounterId + hlcTimestamp', () => {
    const entry = toSoapLedgerEntry({
      id: 'soap-1',
      encounterId: ENC_ID,
      practitionerId: 'prac-1',
      soapSubjective: 'Headache',
      soapPlan: 'Ibuprofen',
      hlcTimestamp: 'hlc-1',
      createdAt: '2026-06-25T10:00:00Z',
    }) as Record<string, any>

    expect(entry.encounterId).toBe(ENC_ID)
    expect(entry.hlcTimestamp).toBe('hlc-1')
    expect(entry.subjective).toBe('Headache')
    expect(entry.plan).toBe('Ibuprofen')
    expect(entry.assessorRef).toBe('Practitioner/prac-1')
  })

  it('passes through an already-local ledger entry unchanged', () => {
    const local = { id: 'soap-2', encounterId: ENC_ID, subjective: 'x' }
    expect(toSoapLedgerEntry(local)).toBe(local)
  })
})

describe('toFhirMedicationStatement (Hub flat → FHIR)', () => {
  it('reconstructs subject.reference and sourcePrescriptionId for the index', () => {
    const fhir = toFhirMedicationStatement({
      id: 'ms-1',
      subjectReference: PATIENT_ID,
      status: 'active',
      medicationDisplay: 'Metformin',
      sourcePrescriptionId: 'rx-1',
      hlcTimestamp: 'hlc-1',
    }) as Record<string, any>

    expect(fhir.subject.reference).toBe(`Patient/${PATIENT_ID}`)
    expect(fhir._ultranos.sourcePrescriptionId).toBe('rx-1')
    expect(fhir.status).toBe('active')
  })
})
