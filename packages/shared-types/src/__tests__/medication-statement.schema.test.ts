import { describe, it, expect } from 'vitest'
import { FhirMedicationStatementSchema } from '../fhir/medication-statement.schema.js'

describe('FhirMedicationStatementSchema', () => {
  const validMedicationStatement = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    resourceType: 'MedicationStatement' as const,
    status: 'active' as const,
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://ultranos.local/medications',
          code: 'WAR001',
          display: 'Warfarin 5mg',
        },
      ],
      text: 'Warfarin 5mg',
    },
    subject: { reference: 'Patient/pat-001' },
    effectivePeriod: {
      start: '2026-04-20T10:00:00.000Z',
    },
    dateAsserted: '2026-04-20T10:00:00.000Z',
    informationSource: { reference: 'Practitioner/doc-001' },
    _ultranos: {
      createdAt: '2026-04-20T10:00:00.000Z',
      sourceEncounterId: '550e8400-e29b-41d4-a716-446655440001',
      sourcePrescriptionId: '550e8400-e29b-41d4-a716-446655440002',
      isOfflineCreated: false,
      hlcTimestamp: '000001714400000:00000:hub-node',
    },
    meta: {
      lastUpdated: '2026-04-20T10:00:00.000Z',
      versionId: '1',
    },
  }

  it('validates a complete MedicationStatement', () => {
    const result = FhirMedicationStatementSchema.safeParse(validMedicationStatement)
    expect(result.success).toBe(true)
  })

  it('accepts all valid status values', () => {
    const statuses = ['active', 'completed', 'entered-in-error', 'intended', 'stopped', 'on-hold'] as const
    for (const status of statuses) {
      const result = FhirMedicationStatementSchema.safeParse({
        ...validMedicationStatement,
        status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      status: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('requires resourceType to be MedicationStatement', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      resourceType: 'Patient',
    })
    expect(result.success).toBe(false)
  })

  it('requires medicationCodeableConcept with at least coding or text', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      medicationCodeableConcept: {},
    })
    expect(result.success).toBe(false)
  })

  it('accepts medicationCodeableConcept with only text (no coding)', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      medicationCodeableConcept: { text: 'Warfarin 5mg' },
    })
    expect(result.success).toBe(true)
  })

  it('allows optional effectivePeriod', () => {
    const { effectivePeriod, ...withoutPeriod } = validMedicationStatement
    const result = FhirMedicationStatementSchema.safeParse(withoutPeriod)
    expect(result.success).toBe(true)
  })

  it('allows optional informationSource', () => {
    const { informationSource, ...withoutSource } = validMedicationStatement
    const result = FhirMedicationStatementSchema.safeParse(withoutSource)
    expect(result.success).toBe(true)
  })

  it('requires _ultranos extension fields', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      _ultranos: { createdAt: '2026-04-20T10:00:00.000Z' },
    })
    expect(result.success).toBe(false)
  })

  it('allows optional sourceEncounterId and sourcePrescriptionId in _ultranos', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      _ultranos: {
        createdAt: '2026-04-20T10:00:00.000Z',
        isOfflineCreated: false,
        hlcTimestamp: '000001714400000:00000:hub-node',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    const result = FhirMedicationStatementSchema.safeParse({
      ...validMedicationStatement,
      id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})
