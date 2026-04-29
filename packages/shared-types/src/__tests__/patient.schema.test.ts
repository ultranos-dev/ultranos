import { describe, it, expect } from 'vitest'
import { FhirPatientSchema, CreatePatientInputSchema } from '../fhir/patient.schema.js'

describe('FhirPatientSchema', () => {
  const validPatient = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    resourceType: 'Patient' as const,
    name: [{ family: 'Al-Rashid', given: ['Ahmad'], text: 'Ahmad Al-Rashid' }],
    gender: 'male' as const,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    telecom: [{ system: 'phone' as const, value: '+971501234567', use: 'mobile' as const }],
    identifier: [{ system: 'UAE_NATIONAL_ID', value: 'encrypted-hash' }],
    _ultranos: {
      nameLocal: 'أحمد الراشد',
      nameLatin: 'Ahmad Al-Rashid',
      isActive: true,
      createdBy: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: '2025-01-15T10:30:00Z',
    },
    meta: {
      lastUpdated: '2025-01-15T10:30:00Z',
    },
  }

  it('accepts a valid Patient resource', () => {
    const result = FhirPatientSchema.safeParse(validPatient)
    expect(result.success).toBe(true)
  })

  it('requires resourceType to be Patient', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, resourceType: 'Encounter' })
    expect(result.success).toBe(false)
  })

  it('requires at least one name entry', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, name: [] })
    expect(result.success).toBe(false)
  })

  it('requires a valid UUID for id', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('validates gender enum', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, gender: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('requires _ultranos.isActive', () => {
    const { isActive: _, ...noActive } = validPatient._ultranos
    const result = FhirPatientSchema.safeParse({
      ...validPatient,
      _ultranos: noActive,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid birthDate format', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, birthDate: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('accepts year-only birthDate', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, birthDate: '1985' })
    expect(result.success).toBe(true)
  })

  it('accepts year-month birthDate', () => {
    const result = FhirPatientSchema.safeParse({ ...validPatient, birthDate: '1985-03' })
    expect(result.success).toBe(true)
  })
})

describe('CreatePatientInputSchema', () => {
  it('accepts valid create input', () => {
    const result = CreatePatientInputSchema.safeParse({
      nameLocal: 'أحمد الراشد',
      gender: 'male',
    })
    expect(result.success).toBe(true)
  })

  it('requires nameLocal to be non-empty', () => {
    const result = CreatePatientInputSchema.safeParse({
      nameLocal: '',
      gender: 'male',
    })
    expect(result.success).toBe(false)
  })

  it('defaults birthYearOnly to false', () => {
    const result = CreatePatientInputSchema.parse({
      nameLocal: 'أحمد الراشد',
      gender: 'male',
    })
    expect(result.birthYearOnly).toBe(false)
  })
})
