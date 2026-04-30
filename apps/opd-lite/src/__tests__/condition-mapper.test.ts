import { describe, it, expect } from 'vitest'
import { FhirConditionSchema } from '@ultranos/shared-types'
import { mapIcd10ToCondition } from '@/lib/condition-mapper'

describe('mapIcd10ToCondition', () => {
  const input = {
    item: {
      code: 'J06.9',
      display: 'Acute upper respiratory infection, unspecified',
    },
    encounterId: 'enc-123',
    patientId: 'pat-456',
    rank: 'primary' as const,
  }

  it('produces a valid FHIR Condition resource', () => {
    const condition = mapIcd10ToCondition(input)
    const result = FhirConditionSchema.safeParse(condition)
    expect(result.success).toBe(true)
  })

  it('uses the ICD-10 system URI in code.coding', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition.code.coding![0].system).toBe(
      'http://hl7.org/fhir/sid/icd-10',
    )
    expect(condition.code.coding![0].code).toBe('J06.9')
  })

  it('sets subject and encounter references correctly', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition.subject.reference).toBe('Patient/pat-456')
    expect(condition.encounter.reference).toBe('Encounter/enc-123')
  })

  it('sets primary diagnosis rank in _ultranos', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition._ultranos.diagnosisRank).toBe('primary')
  })

  it('sets secondary diagnosis rank when specified', () => {
    const condition = mapIcd10ToCondition({ ...input, rank: 'secondary' })
    expect(condition._ultranos.diagnosisRank).toBe('secondary')
  })

  it('sets clinicalStatus to active', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition.clinicalStatus.coding[0].code).toBe('active')
  })

  it('sets category to encounter-diagnosis', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition.category![0].coding[0].code).toBe('encounter-diagnosis')
  })

  it('generates a unique id', () => {
    const c1 = mapIcd10ToCondition(input)
    const c2 = mapIcd10ToCondition(input)
    expect(c1.id).not.toBe(c2.id)
  })

  it('includes display text in code.text', () => {
    const condition = mapIcd10ToCondition(input)
    expect(condition.code.text).toBe(input.item.display)
  })

  it('throws if encounterId is empty', () => {
    expect(() =>
      mapIcd10ToCondition({ ...input, encounterId: '' }),
    ).toThrow('encounterId is required')
  })

  it('throws if patientId is empty', () => {
    expect(() =>
      mapIcd10ToCondition({ ...input, patientId: '' }),
    ).toThrow('patientId is required')
  })

  it('throws if encounterId is whitespace-only', () => {
    expect(() =>
      mapIcd10ToCondition({ ...input, encounterId: '   ' }),
    ).toThrow('encounterId is required')
  })
})
