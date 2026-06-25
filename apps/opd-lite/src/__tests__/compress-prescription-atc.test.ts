import { describe, it, expect } from 'vitest'
import { compressPrescription } from '@/lib/compress-prescription'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

function rx(code: string): FhirMedicationRequestZod {
  return {
    id: 'rx-1',
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:formulary', code, display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg (Capsule)',
    },
    subject: { reference: 'Patient/p-1' },
    requester: { reference: 'Practitioner/dr-1' },
    authoredOn: '2026-06-24T00:00:00.000Z',
    dosageInstruction: [{ sequence: 1, text: '1 capsule', doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }] }],
    dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
  } as unknown as FhirMedicationRequestZod
}

describe('compressPrescription — atc field', () => {
  it('populates atc when the code is ATC-shaped', () => {
    const compact = JSON.parse(compressPrescription([rx('J01CA04')]))
    expect(compact[0].atc).toBe('J01CA04')
    expect(compact[0].med).toBe('J01CA04')
  })

  it('omits atc when the code is not ATC-shaped (e.g. legacy RX code)', () => {
    const compact = JSON.parse(compressPrescription([rx('RX001')]))
    expect(compact[0].atc).toBeUndefined()
    expect(compact[0].med).toBe('RX001')
  })

  it('omits atc for lowercase codes (ATC is uppercase by spec)', () => {
    const compact = JSON.parse(compressPrescription([rx('j01CA04')]))
    expect(compact[0].atc).toBeUndefined()
  })

  it('carries a brand hint from a urn:ultranos:brand coding', () => {
    const r = {
      id: 'rx-2', resourceType: 'MedicationRequest', status: 'active', intent: 'order',
      medicationCodeableConcept: {
        coding: [
          { system: 'urn:ultranos:formulary', code: 'J01CA04', display: 'Amoxicillin' },
          { system: 'urn:ultranos:brand', code: 'Amoxil', display: 'Amoxil' },
        ],
        text: 'Amoxicillin 500mg (Capsule)',
      },
      subject: { reference: 'Patient/p-1' }, requester: { reference: 'Practitioner/dr-1' },
      authoredOn: '2026-06-24T00:00:00.000Z',
      dosageInstruction: [{ sequence: 1, text: '1', doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }] }],
      dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
    } as unknown as import('@ultranos/shared-types').FhirMedicationRequestZod
    const compact = JSON.parse(compressPrescription([r]))
    expect(compact[0].brand).toBe('Amoxil')
    expect(compact[0].atc).toBe('J01CA04')
    expect(compact[0].med).toBe('J01CA04')
  })
})
