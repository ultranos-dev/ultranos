import { describe, it, expect } from 'vitest'
import { AFGHAN_PROVINCES } from '../reference/afghanistan-geo.js'
import { CreatePatientMpiInputSchema } from '../fhir/patient.schema.js'

describe('AFGHAN_PROVINCES', () => {
  it('contains 34 provinces', () => {
    expect(AFGHAN_PROVINCES).toHaveLength(34)
  })

  it('contains Kabul', () => {
    expect(AFGHAN_PROVINCES).toContain('Kabul')
  })
})

describe('CreatePatientMpiInputSchema — cross-field rules', () => {
  it('rejects birthYearOnly=true with birthDate present', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYearOnly: true,
      birthDate: '1985-01-01',
      birthYear: 1985,
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects when neither birthDate nor birthYear is provided', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts birthYear alone (birthYearOnly=true)', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYearOnly: true,
      birthYear: 1985,
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects VERBAL_WITNESSED consent without witnessedBy', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYear: 1985,
      birthYearOnly: true,
      consent: { method: 'VERBAL_WITNESSED', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts VERBAL_WITNESSED consent with witnessedBy UUID', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYear: 1985,
      birthYearOnly: true,
      consent: {
        method: 'VERBAL_WITNESSED',
        witnessedBy: 'a0000000-0000-0000-0000-000000000001',
        language: 'en',
        version: 'v1.0-en',
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts birthYearOnly=false with birthYear only (no birthDate)', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      gender: 'male',
      birthYearOnly: false,
      birthYear: 1985,
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(true)
  })

  it('transforms firstName alias to nameGiven', () => {
    const result = CreatePatientMpiInputSchema.safeParse({
      nameLocal: 'Ahmad',
      firstName: 'Ahmad',
      gender: 'male',
      birthDate: '1985-06-15',
      consent: { method: 'WRITTEN', language: 'en', version: 'v1.0-en' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nameGiven).toBe('Ahmad')
    }
  })
})
