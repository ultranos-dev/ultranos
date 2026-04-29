import { describe, it, expect } from 'vitest'
import { FhirConditionSchema } from '../fhir/condition.schema.js'

describe('FhirConditionSchema', () => {
  const validCondition = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    resourceType: 'Condition' as const,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active' as const,
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis' as const,
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: 'J06.9',
          display: 'Acute upper respiratory infection, unspecified',
        },
      ],
      text: 'Acute upper respiratory infection, unspecified',
    },
    subject: { reference: 'Patient/123' },
    encounter: { reference: 'Encounter/456' },
    recordedDate: '2026-04-28T12:00:00.000Z',
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: '2026-04-28T12:00:00.000Z:0000:node1',
      createdAt: '2026-04-28T12:00:00.000Z',
      diagnosisRank: 'primary' as const,
    },
    meta: {
      lastUpdated: '2026-04-28T12:00:00.000Z',
      versionId: '1',
    },
  }

  it('validates a correct Condition resource', () => {
    const result = FhirConditionSchema.safeParse(validCondition)
    expect(result.success).toBe(true)
  })

  it('accepts secondary diagnosis rank', () => {
    const secondary = {
      ...validCondition,
      _ultranos: { ...validCondition._ultranos, diagnosisRank: 'secondary' },
    }
    const result = FhirConditionSchema.safeParse(secondary)
    expect(result.success).toBe(true)
  })

  it('rejects invalid diagnosis rank', () => {
    const invalid = {
      ...validCondition,
      _ultranos: { ...validCondition._ultranos, diagnosisRank: 'tertiary' },
    }
    const result = FhirConditionSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects missing code field', () => {
    const { code: _, ...noCode } = validCondition
    const result = FhirConditionSchema.safeParse(noCode)
    expect(result.success).toBe(false)
  })

  it('rejects wrong resourceType', () => {
    const wrong = { ...validCondition, resourceType: 'Observation' }
    const result = FhirConditionSchema.safeParse(wrong)
    expect(result.success).toBe(false)
  })

  it('requires ICD-10 system in code coding', () => {
    const result = FhirConditionSchema.safeParse(validCondition)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.code.coding![0].system).toBe(
        'http://hl7.org/fhir/sid/icd-10',
      )
    }
  })
})
