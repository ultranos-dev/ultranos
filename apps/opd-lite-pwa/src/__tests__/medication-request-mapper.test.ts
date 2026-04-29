import { describe, it, expect } from 'vitest'
import { mapFormToMedicationRequest } from '@/lib/medication-request-mapper'
import { FhirMedicationRequestSchema } from '@ultranos/shared-types'
import { PrescriptionStatus } from '@ultranos/shared-types'
import type { PrescriptionFormData } from '@/lib/prescription-config'

const baseForm: PrescriptionFormData = {
  medicationCode: 'RX001',
  medicationDisplay: 'Amoxicillin',
  medicationForm: 'Capsule',
  medicationStrength: '500 mg',
  dosageQuantity: '1',
  dosageUnit: 'tablet',
  frequencyCode: 'BID',
  durationDays: '7',
  notes: '',
}

const context = {
  encounterId: 'enc-123',
  patientId: 'pat-456',
  practitionerRef: 'Practitioner/doc-789',
}

describe('mapFormToMedicationRequest', () => {
  it('produces a valid FHIR MedicationRequest (Zod validates)', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    const parsed = FhirMedicationRequestSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('sets resourceType to MedicationRequest', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.resourceType).toBe('MedicationRequest')
  })

  it('sets status to active and intent to order', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.status).toBe('active')
    expect(result.intent).toBe('order')
  })

  it('maps medicationCodeableConcept with code, display, and text', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.medicationCodeableConcept.coding[0].code).toBe('RX001')
    expect(result.medicationCodeableConcept.coding[0].display).toBe('Amoxicillin')
    expect(result.medicationCodeableConcept.text).toBe('Amoxicillin 500 mg (Capsule)')
  })

  it('maps subject reference to Patient/{id}', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.subject.reference).toBe('Patient/pat-456')
  })

  it('maps encounter reference to Encounter/{id}', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.encounter?.reference).toBe('Encounter/enc-123')
  })

  it('maps requester reference', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.requester.reference).toBe('Practitioner/doc-789')
  })

  it('maps dosageInstruction with quantity, timing, and text', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    const dosage = result.dosageInstruction?.[0]
    expect(dosage).toBeDefined()
    expect(dosage!.doseAndRate?.[0]?.doseQuantity?.value).toBe(1)
    expect(dosage!.doseAndRate?.[0]?.doseQuantity?.unit).toBe('tablet')
    expect(dosage!.timing?.repeat?.frequency).toBe(2)
    expect(dosage!.timing?.repeat?.period).toBe(1)
    expect(dosage!.timing?.repeat?.periodUnit).toBe('d')
    expect(dosage!.timing?.code?.coding?.[0]?.code).toBe('BID')
  })

  it('maps dispenseRequest with supply duration', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.dispenseRequest?.expectedSupplyDuration?.value).toBe(7)
    expect(result.dispenseRequest?.expectedSupplyDuration?.unit).toBe('d')
  })

  it('includes notes when provided', () => {
    const formWithNotes = { ...baseForm, notes: 'Take with food' }
    const result = mapFormToMedicationRequest(formWithNotes, context)
    expect(result.note?.[0]?.text).toBe('Take with food')
  })

  it('omits notes when empty', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.note).toBeUndefined()
  })

  it('assigns an HLC timestamp', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result._ultranos.hlcTimestamp).toBeTruthy()
    // HLC format: wallMs:counter:nodeId (colon-separated)
    expect(result._ultranos.hlcTimestamp.split(':').length).toBe(3)
  })

  it('sets prescriptionStatus to ACTIVE', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result._ultranos.prescriptionStatus).toBe(PrescriptionStatus.ACTIVE)
  })

  it('sets interactionCheckResult to UNAVAILABLE (drug check not yet integrated)', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result._ultranos.interactionCheckResult).toBe('UNAVAILABLE')
  })

  it('sets isOfflineCreated to true', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result._ultranos.isOfflineCreated).toBe(true)
  })

  it('generates a valid UUID for id', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('sets authoredOn to a valid ISO datetime', () => {
    const result = mapFormToMedicationRequest(baseForm, context)
    expect(new Date(result.authoredOn).toISOString()).toBe(result.authoredOn)
  })

  it('throws if encounterId is missing', () => {
    expect(() =>
      mapFormToMedicationRequest(baseForm, { ...context, encounterId: '' }),
    ).toThrow('encounterId is required')
  })

  it('throws if patientId is missing', () => {
    expect(() =>
      mapFormToMedicationRequest(baseForm, { ...context, patientId: '' }),
    ).toThrow('patientId is required')
  })

  it('throws if medicationCode is missing', () => {
    expect(() =>
      mapFormToMedicationRequest({ ...baseForm, medicationCode: '' }, context),
    ).toThrow('medicationCode is required')
  })
})
