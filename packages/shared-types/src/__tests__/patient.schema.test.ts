import { describe, it, expect } from 'vitest'
import { FhirPatientSchema, CreatePatientInputSchema, CreatePatientMpiInputSchema } from '../fhir/patient.schema.js'

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
      patient_tier: 'FREE' as const,
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

  it('requires _ultranos.patient_tier (Story 27.10)', () => {
    const { patient_tier: _, ...noTier } = validPatient._ultranos
    const result = FhirPatientSchema.safeParse({
      ...validPatient,
      _ultranos: noTier,
    })
    expect(result.success).toBe(false)
  })

  it('accepts patient_tier FREE and PREMIUM (Story 27.10)', () => {
    const free = FhirPatientSchema.safeParse(validPatient)
    expect(free.success).toBe(true)

    const premium = FhirPatientSchema.safeParse({
      ...validPatient,
      _ultranos: { ...validPatient._ultranos, patient_tier: 'PREMIUM' },
    })
    expect(premium.success).toBe(true)
  })

  it('rejects invalid patient_tier values', () => {
    const result = FhirPatientSchema.safeParse({
      ...validPatient,
      _ultranos: { ...validPatient._ultranos, patient_tier: 'ENTERPRISE' },
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

  it('accepts nameFamily as optional string', () => {
    const base = {
      nameLocal: 'Ahmad',
      gender: 'male',
      birthDate: '1990-01-01',
      birthYearOnly: false,
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    }
    expect(CreatePatientInputSchema.safeParse({ ...base, nameFamily: 'Ahmadzai' }).success).toBe(true)
    expect(CreatePatientInputSchema.safeParse({ ...base, nameFamily: '' }).success).toBe(true)
    expect(CreatePatientInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects nameFamily longer than 200 chars', () => {
    const base = {
      nameLocal: 'Ahmad',
      gender: 'male',
      birthDate: '1990-01-01',
      birthYearOnly: false,
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    }
    const result = CreatePatientInputSchema.safeParse({ ...base, nameFamily: 'A'.repeat(201) })
    expect(result.success).toBe(false)
  })
})

describe('CreatePatientMpiInputSchema — HMIS demographic fields', () => {
  const base = {
    nameLocal: 'Ahmad Karimi',
    nameGiven: 'Ahmad',
    gender: 'male',
    birthYearOnly: true,
    birthYear: 1985,
    isNomadic: false,
    consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    addressOrigin: { province: 'Kabul', district: 'Kabul' },
  }

  it('accepts maritalStatus M', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: 'M' })
    expect(result.success).toBe(true)
  })

  it('rejects polygamous maritalStatus P', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: 'P' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid marital status codes', () => {
    for (const code of ['M', 'S', 'D', 'W', 'UNK'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, maritalStatus: code })
      expect(result.success).toBe(true)
    }
  })

  it('accepts a single emergency contact', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      contacts: [{ relationship: 'SPOUSE', name: 'Fatima Ahmad', phone: '+93701234567' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects more than 2 emergency contacts', () => {
    const contact = { relationship: 'SPOUSE' as const, name: 'Test' }
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      contacts: [contact, contact, contact],
    })
    expect(result.success).toBe(false)
  })

  it('accepts displacement categories', () => {
    for (const cat of ['IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, displacementCategory: cat })
      expect(result.success).toBe(true)
    }
  })

  it('accepts education levels', () => {
    for (const lvl of ['NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, educationLevel: lvl })
      expect(result.success).toBe(true)
    }
  })

  it('accepts nationality as 2-char ISO code', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, nationality: 'AF' })
    expect(result.success).toBe(true)
  })

  it('rejects nationality longer than 2 chars', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, nationality: 'AFG' })
    expect(result.success).toBe(false)
  })

  it('accepts disability boolean', () => {
    const result = CreatePatientMpiInputSchema.safeParse({ ...base, disability: true })
    expect(result.success).toBe(true)
  })

  it('accepts phoneUse values', () => {
    for (const use of ['home', 'work', 'mobile'] as const) {
      const result = CreatePatientMpiInputSchema.safeParse({ ...base, phoneUse: use })
      expect(result.success).toBe(true)
    }
  })

  it('accepts birthYear without birthDate when birthYearOnly is not set', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad Karimi',
      nameGiven: 'Ahmad',
      gender: 'male',
      birthYear: 1985,
      isNomadic: false,
      addressOrigin: { province: 'Kabul', district: 'Kabul' },
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    })
    expect(result.success).toBe(true)
  })
})

describe('CreatePatientMpiInputSchema — Pashto language support', () => {
  const base = {
    nameLocal: 'احمد کریمي',
    nameGiven: 'احمد',
    gender: 'male',
    birthYearOnly: true,
    birthYear: 1985,
    isNomadic: false,
    addressOrigin: { province: 'Kabul', district: 'Kabul' },
  }

  it('accepts ps (Pashto) as consent language', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      consent: { method: 'WRITTEN', language: 'ps', version: '1.0' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts ps (Pashto) as preferredLanguage', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      ...base,
      preferredLanguage: 'ps',
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
    })
    expect(result.success).toBe(true)
  })
})
