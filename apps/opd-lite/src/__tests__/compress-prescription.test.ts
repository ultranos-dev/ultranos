import { describe, it, expect } from 'vitest'
import { compressPrescription } from '@/lib/compress-prescription'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

function makeMockRx(overrides?: Partial<FhirMedicationRequestZod>): FhirMedicationRequestZod {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:ultranos:formulary',
          code: 'AMX500',
          display: 'Amoxicillin',
        },
      ],
      text: 'Amoxicillin 500mg (Capsule)',
    },
    subject: { reference: 'Patient/p-123' },
    encounter: { reference: 'Encounter/e-456' },
    requester: { reference: 'Practitioner/dr-789' },
    authoredOn: '2026-04-29T10:00:00.000Z',
    dosageInstruction: [
      {
        sequence: 1,
        text: '1 capsule, Three times daily, for 7 days',
        timing: {
          repeat: { frequency: 3, period: 1, periodUnit: 'd' },
          code: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation',
                code: 'TID',
                display: 'Three times daily',
              },
            ],
          },
        },
        doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }],
      },
    ],
    dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
    note: [{ text: 'Take with food', time: '2026-04-29T10:00:00.000Z' }],
    _ultranos: {
      prescriptionStatus: 'ACTIVE' as never,
      interactionCheckResult: 'CLEAR',
      isOfflineCreated: true,
      hlcTimestamp: '000001746000000000:00001:node1',
      createdAt: '2026-04-29T10:00:00.000Z',
    },
    meta: {
      lastUpdated: '2026-04-29T10:00:00.000Z',
      versionId: '1',
    },
    ...overrides,
  }
}

describe('compressPrescription', () => {
  it('produces a compact JSON string', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])
    expect(typeof compressed).toBe('string')
    // Should be valid JSON
    expect(() => JSON.parse(compressed)).not.toThrow()
  })

  it('keeps payload under 1KB for a single prescription', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])
    const byteLength = new TextEncoder().encode(compressed).length
    expect(byteLength).toBeLessThan(1024)
  })

  it('preserves essential medication data', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])
    const parsed = JSON.parse(compressed)

    // Must contain medication code + display
    expect(compressed).toContain('AMX500')
    expect(compressed).toContain('Amoxicillin')
  })

  it('preserves encounter and requester references', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])
    const parsed = JSON.parse(compressed)

    expect(compressed).toContain('e-456')
    expect(compressed).toContain('dr-789')
  })

  it('preserves dosage and duration information', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])

    // Dosage quantity + frequency + duration should survive
    expect(compressed).toContain('7')
  })

  it('excludes verbose FHIR system URIs', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])

    // Full FHIR system URIs should be stripped to save space
    expect(compressed).not.toContain('http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation')
  })

  it('does NOT include patient demographics, PHI, or clinical notes', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])

    // Only the patient reference ID, not any demographics
    expect(compressed).toContain('p-123')
    // No internal system metadata that could leak PHI
    expect(compressed).not.toContain('hlcTimestamp')
    expect(compressed).not.toContain('isOfflineCreated')
    // Clinical notes must not appear in QR payload
    expect(compressed).not.toContain('Take with food')
    expect(compressed).not.toContain('note')
  })

  it('handles multiple prescriptions', () => {
    const rx1 = makeMockRx()
    const rx2 = makeMockRx({
      id: 'ffffffff-1111-2222-3333-444444444444',
      medicationCodeableConcept: {
        coding: [{ system: 'urn:ultranos:formulary', code: 'IBU400', display: 'Ibuprofen' }],
        text: 'Ibuprofen 400mg (Tablet)',
      },
    })
    const compressed = compressPrescription([rx1, rx2])
    const parsed = JSON.parse(compressed)

    expect(compressed).toContain('AMX500')
    expect(compressed).toContain('IBU400')
  })

  it('includes authoredOn timestamp', () => {
    const rx = makeMockRx()
    const compressed = compressPrescription([rx])
    expect(compressed).toContain('2026-04-29')
  })

  it('throws if no prescriptions are provided', () => {
    expect(() => compressPrescription([])).toThrow()
  })
})
