import { describe, it, expect } from 'vitest'
import { FhirMedicationRequestSchema } from '../fhir/medication-request.schema.js'

describe('FhirMedicationRequestSchema', () => {
  const validMedRequest = {
    id: '550e8400-e29b-41d4-a716-446655440020',
    resourceType: 'MedicationRequest' as const,
    status: 'active' as const,
    intent: 'order' as const,
    medicationCodeableConcept: {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '197361', display: 'Amoxicillin 500mg' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/550e8400-e29b-41d4-a716-446655440000' },
    requester: { reference: 'Practitioner/550e8400-e29b-41d4-a716-446655440001' },
    authoredOn: '2025-01-15T10:00:00Z',
    dosageInstruction: [
      {
        sequence: 1,
        text: '1 capsule 3 times daily',
        timing: {
          repeat: { frequency: 3, period: 1, periodUnit: 'd' as const },
        },
        route: { text: 'Oral' },
        doseAndRate: [{ doseQuantity: { value: 500, unit: 'mg' } }],
      },
    ],
    dispenseRequest: {
      quantity: { value: 21, unit: 'capsule' },
      expectedSupplyDuration: { value: 7, unit: 'days' },
    },
    _ultranos: {
      prescriptionStatus: 'ACTIVE' as const,
      interactionCheckResult: 'CLEAR' as const,
      isOfflineCreated: false,
      hlcTimestamp: '000001705312800:00000:node-abc',
      createdAt: '2025-01-15T10:00:00Z',
    },
    meta: {
      lastUpdated: '2025-01-15T10:00:00Z',
    },
  }

  it('accepts a valid MedicationRequest resource', () => {
    const result = FhirMedicationRequestSchema.safeParse(validMedRequest)
    expect(result.success).toBe(true)
  })

  it('requires resourceType to be MedicationRequest', () => {
    const result = FhirMedicationRequestSchema.safeParse({ ...validMedRequest, resourceType: 'Patient' })
    expect(result.success).toBe(false)
  })

  it('validates status enum', () => {
    const result = FhirMedicationRequestSchema.safeParse({ ...validMedRequest, status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('validates intent enum', () => {
    const result = FhirMedicationRequestSchema.safeParse({ ...validMedRequest, intent: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('validates prescriptionStatus in _ultranos', () => {
    const result = FhirMedicationRequestSchema.safeParse({
      ...validMedRequest,
      _ultranos: { ...validMedRequest._ultranos, prescriptionStatus: 'INVALID' },
    })
    expect(result.success).toBe(false)
  })

  it('requires authoredOn datetime', () => {
    const { authoredOn: _, ...noAuthored } = validMedRequest
    const result = FhirMedicationRequestSchema.safeParse(noAuthored)
    expect(result.success).toBe(false)
  })

  it('validates dosage periodUnit enum', () => {
    const badDosage = {
      ...validMedRequest,
      dosageInstruction: [{
        timing: { repeat: { frequency: 1, period: 1, periodUnit: 'invalid' } },
      }],
    }
    const result = FhirMedicationRequestSchema.safeParse(badDosage)
    expect(result.success).toBe(false)
  })

  it('requires interactionCheckResult (not optional)', () => {
    const { interactionCheckResult: _, ...noCheck } = validMedRequest._ultranos
    const result = FhirMedicationRequestSchema.safeParse({
      ...validMedRequest,
      _ultranos: noCheck,
    })
    expect(result.success).toBe(false)
  })

  it('requires interactionOverrideReason when BLOCKED', () => {
    const result = FhirMedicationRequestSchema.safeParse({
      ...validMedRequest,
      _ultranos: {
        ...validMedRequest._ultranos,
        interactionCheckResult: 'BLOCKED',
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts BLOCKED with override reason', () => {
    const result = FhirMedicationRequestSchema.safeParse({
      ...validMedRequest,
      _ultranos: {
        ...validMedRequest._ultranos,
        interactionCheckResult: 'BLOCKED',
        interactionOverrideReason: 'Patient has been on this medication for 5 years without adverse effects',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty CodeableConcept for medication', () => {
    const result = FhirMedicationRequestSchema.safeParse({
      ...validMedRequest,
      medicationCodeableConcept: {},
    })
    expect(result.success).toBe(false)
  })
})
