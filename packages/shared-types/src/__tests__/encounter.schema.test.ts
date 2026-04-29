import { describe, it, expect } from 'vitest'
import { FhirEncounterSchema } from '../fhir/encounter.schema.js'

describe('FhirEncounterSchema', () => {
  const validEncounter = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    resourceType: 'Encounter' as const,
    status: 'in-progress' as const,
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    subject: {
      reference: 'Patient/550e8400-e29b-41d4-a716-446655440000',
      display: 'Ahmad Al-Rashid',
    },
    period: {
      start: '2025-01-15T09:00:00Z',
    },
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: '000001705312800:00000:node-abc',
      createdAt: '2025-01-15T09:00:00Z',
    },
    meta: {
      lastUpdated: '2025-01-15T09:30:00Z',
    },
  }

  it('accepts a valid Encounter resource', () => {
    const result = FhirEncounterSchema.safeParse(validEncounter)
    expect(result.success).toBe(true)
  })

  it('requires resourceType to be Encounter', () => {
    const result = FhirEncounterSchema.safeParse({ ...validEncounter, resourceType: 'Patient' })
    expect(result.success).toBe(false)
  })

  it('validates encounter status enum', () => {
    const result = FhirEncounterSchema.safeParse({ ...validEncounter, status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('requires subject reference', () => {
    const { subject: _, ...noSubject } = validEncounter
    const result = FhirEncounterSchema.safeParse(noSubject)
    expect(result.success).toBe(false)
  })

  it('requires _ultranos.hlcTimestamp', () => {
    const result = FhirEncounterSchema.safeParse({
      ...validEncounter,
      _ultranos: { isOfflineCreated: true, createdAt: '2025-01-15T09:00:00Z' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts planned encounter without period.start', () => {
    const result = FhirEncounterSchema.safeParse({
      ...validEncounter,
      status: 'planned',
      period: {},
    })
    expect(result.success).toBe(true)
  })

  it('accepts date-only period.start', () => {
    const result = FhirEncounterSchema.safeParse({
      ...validEncounter,
      period: { start: '2025-01-15' },
    })
    expect(result.success).toBe(true)
  })
})
