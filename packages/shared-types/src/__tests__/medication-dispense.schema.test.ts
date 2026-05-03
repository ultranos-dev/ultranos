import { describe, it, expect } from 'vitest'
import { FhirMedicationDispenseSchema } from '../fhir/medication-dispense.schema.js'

describe('FhirMedicationDispenseSchema', () => {
  const validDispense = {
    id: '550e8400-e29b-41d4-a716-446655440040',
    resourceType: 'MedicationDispense' as const,
    status: 'completed' as const,
    medicationCodeableConcept: {
      coding: [
        { system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin 500mg' },
      ],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/550e8400-e29b-41d4-a716-446655440000' },
    performer: [
      { actor: { reference: 'Practitioner/550e8400-e29b-41d4-a716-446655440001' } },
    ],
    authorizingPrescription: [
      { reference: 'MedicationRequest/550e8400-e29b-41d4-a716-446655440020' },
    ],
    whenHandedOver: '2025-06-15T15:00:00Z',
    dosageInstruction: [{ text: '1 capsule 3 times daily, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '000001718457000:00000:pharm-node-1',
      brandName: 'Augmentin',
      batchLot: 'LOT-2025-06-A',
      isOfflineCreated: false,
      createdAt: '2025-06-15T15:00:00Z',
    },
    meta: {
      lastUpdated: '2025-06-15T15:00:00Z',
    },
  }

  it('accepts a valid MedicationDispense resource', () => {
    const result = FhirMedicationDispenseSchema.safeParse(validDispense)
    expect(result.success).toBe(true)
  })

  it('requires resourceType to be MedicationDispense', () => {
    const result = FhirMedicationDispenseSchema.safeParse({
      ...validDispense,
      resourceType: 'Patient',
    })
    expect(result.success).toBe(false)
  })

  it('validates status enum', () => {
    const result = FhirMedicationDispenseSchema.safeParse({
      ...validDispense,
      status: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts all FHIR R4 MedicationDispense statuses', () => {
    const statuses = [
      'preparation', 'in-progress', 'cancelled', 'on-hold',
      'completed', 'entered-in-error', 'stopped', 'declined', 'unknown',
    ]
    for (const status of statuses) {
      // non-completed statuses don't require whenHandedOver
      const data = status === 'completed'
        ? { ...validDispense, status }
        : { ...validDispense, status, whenHandedOver: undefined }
      const result = FhirMedicationDispenseSchema.safeParse(data)
      expect(result.success).toBe(true)
    }
  })

  it('requires whenHandedOver when status is completed', () => {
    const { whenHandedOver: _, ...noHandedOver } = validDispense
    const result = FhirMedicationDispenseSchema.safeParse(noHandedOver)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('whenHandedOver')
    }
  })

  it('allows missing whenHandedOver for non-completed statuses', () => {
    const { whenHandedOver: _, ...noHandedOver } = validDispense
    const result = FhirMedicationDispenseSchema.safeParse({
      ...noHandedOver,
      status: 'preparation',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const { subject: _s, ...noSubject } = validDispense
    expect(FhirMedicationDispenseSchema.safeParse(noSubject).success).toBe(false)

    const { medicationCodeableConcept: _m, ...noMed } = validDispense
    expect(FhirMedicationDispenseSchema.safeParse(noMed).success).toBe(false)

    const { _ultranos: _u, ...noExt } = validDispense
    expect(FhirMedicationDispenseSchema.safeParse(noExt).success).toBe(false)

    const { meta: _mt, ...noMeta } = validDispense
    expect(FhirMedicationDispenseSchema.safeParse(noMeta).success).toBe(false)
  })

  it('accepts optional quantity with SimpleQuantity shape', () => {
    const withQty = {
      ...validDispense,
      quantity: { value: 21, unit: 'capsule', system: 'http://unitsofmeasure.org', code: '{capsule}' },
    }
    expect(FhirMedicationDispenseSchema.safeParse(withQty).success).toBe(true)
  })

  it('accepts _ultranos fulfillment tracking fields', () => {
    const withFulfillment = {
      ...validDispense,
      _ultranos: {
        ...validDispense._ultranos,
        fulfillmentContext: 'partial-fill',
        fulfilledCount: 2,
        totalCount: 3,
      },
    }
    expect(FhirMedicationDispenseSchema.safeParse(withFulfillment).success).toBe(true)
  })

  it('rejects empty CodeableConcept for medication', () => {
    const result = FhirMedicationDispenseSchema.safeParse({
      ...validDispense,
      medicationCodeableConcept: {},
    })
    expect(result.success).toBe(false)
  })

  it('accepts minimal valid dispense (no optional fields)', () => {
    const minimal = {
      id: '550e8400-e29b-41d4-a716-446655440040',
      resourceType: 'MedicationDispense' as const,
      status: 'preparation' as const,
      medicationCodeableConcept: { text: 'Paracetamol 500mg' },
      subject: { reference: 'Patient/550e8400-e29b-41d4-a716-446655440000' },
      _ultranos: {
        hlcTimestamp: '000001718457000:00000:pharm-node-1',
        isOfflineCreated: true,
        createdAt: '2025-06-15T15:00:00Z',
      },
      meta: { lastUpdated: '2025-06-15T15:00:00Z' },
    }
    expect(FhirMedicationDispenseSchema.safeParse(minimal).success).toBe(true)
  })
})
