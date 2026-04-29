import { describe, it, expect } from 'vitest'
import { mapSoapToClinicalImpression } from '@/lib/fhir-mappers'
import { ClinicalImpressionNoteSchema } from '@ultranos/shared-types'

const TEST_ENCOUNTER_ID = 'e7e3c8a0-2222-4000-8000-000000000001'
const TEST_PATIENT_ID = 'b7e3c8a0-1111-4000-8000-000000000001'
const TEST_PRACTITIONER_ID = 'p7e3c8a0-3333-4000-8000-000000000001'

describe('mapSoapToClinicalImpression', () => {
  it('should return a valid FHIR ClinicalImpression resource', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'Patient reports headache',
      objective: 'BP 120/80, temperature 37.2C',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result.resourceType).toBe('ClinicalImpression')
    expect(result.id).toBeTruthy()
    expect(result.status).toBe('in-progress')
  })

  it('should link to the encounter via encounter reference', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'test',
      objective: 'test',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result.encounter.reference).toBe(`Encounter/${TEST_ENCOUNTER_ID}`)
  })

  it('should link to the patient via subject reference', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'test',
      objective: 'test',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result.subject.reference).toBe(`Patient/${TEST_PATIENT_ID}`)
  })

  it('should store subjective and objective in note array', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'Headache for 3 days',
      objective: 'BP 140/90',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result.note).toBeDefined()
    expect(result.note!.length).toBe(2)

    const subjectiveNote = result.note!.find((n) => n.text.startsWith('[Subjective]'))
    const objectiveNote = result.note!.find((n) => n.text.startsWith('[Objective]'))
    expect(subjectiveNote).toBeDefined()
    expect(objectiveNote).toBeDefined()
    expect(subjectiveNote!.text).toContain('Headache for 3 days')
    expect(objectiveNote!.text).toContain('BP 140/90')
  })

  it('should include assessor reference to practitioner', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'test',
      objective: 'test',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result.assessor!.reference).toBe(`Practitioner/${TEST_PRACTITIONER_ID}`)
  })

  it('should have meta.lastUpdated as ISO datetime', () => {
    const before = new Date().toISOString()
    const result = mapSoapToClinicalImpression({
      subjective: 'test',
      objective: 'test',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })
    const after = new Date().toISOString()

    expect(result.meta.lastUpdated >= before).toBe(true)
    expect(result.meta.lastUpdated <= after).toBe(true)
  })

  it('should validate against ClinicalImpressionNoteSchema', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'headache',
      objective: 'BP normal',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    const parsed = ClinicalImpressionNoteSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('should include _ultranos extension with hlcTimestamp', () => {
    const result = mapSoapToClinicalImpression({
      subjective: 'test',
      objective: 'test',
      encounterId: TEST_ENCOUNTER_ID,
      patientId: TEST_PATIENT_ID,
      practitionerId: TEST_PRACTITIONER_ID,
    })

    expect(result._ultranos).toBeDefined()
    expect(result._ultranos.hlcTimestamp).toBeTruthy()
    expect(result._ultranos.isOfflineCreated).toBe(true)
  })
})
