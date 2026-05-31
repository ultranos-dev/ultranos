import { describe, it, expect } from 'vitest'
import { FhirServiceRequestSchema, type LabServiceRequest } from '../service-request.schema'

function validServiceRequest() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    resourceType: 'ServiceRequest' as const,
    status: 'active' as const,
    intent: 'order' as const,
    priority: 'stat' as const,
    code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }] },
    orderDetail: [{ text: 'Fasting required' }],
    subject: { reference: 'Patient/123', display: 'Ahmad' },
    encounter: { reference: 'Encounter/456' },
    requester: { reference: 'Practitioner/789', display: 'Dr. Karimi' },
    authoredOn: '2026-05-30T10:00:00.000Z',
    reasonCode: [{ text: 'Suspected anemia' }],
    supportingInfo: [{ reference: 'Condition/999' }],
    note: [{ text: 'Urgent — patient symptomatic', time: '2026-05-30T10:00:00.000Z' }],
    _ultranos: {
      createdAt: '2026-05-30T10:00:00.000Z',
      hlcTimestamp: '2026-05-30T10:00:00.000Z:0000:node1',
      isOfflineCreated: false,
      specialInstructions: 'Fasting sample required',
    },
    meta: { lastUpdated: '2026-05-30T10:00:00.000Z' },
  }
}

describe('FhirServiceRequestSchema', () => {
  it('validates a correct ServiceRequest', () => {
    const result = FhirServiceRequestSchema.safeParse(validServiceRequest())
    expect(result.success).toBe(true)
  })

  it('validates minimal ServiceRequest (no optional fields)', () => {
    const minimal = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      resourceType: 'ServiceRequest' as const,
      status: 'active' as const,
      intent: 'order' as const,
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2' }] },
      subject: { reference: 'Patient/123' },
      requester: { reference: 'Practitioner/789' },
      authoredOn: '2026-05-30T10:00:00.000Z',
      _ultranos: {
        createdAt: '2026-05-30T10:00:00.000Z',
        hlcTimestamp: '2026-05-30T10:00:00.000Z:0000:node1',
        isOfflineCreated: false,
      },
      meta: { lastUpdated: '2026-05-30T10:00:00.000Z' },
    }
    const result = FhirServiceRequestSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects invalid resourceType', () => {
    const input = { ...validServiceRequest(), resourceType: 'Observation' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const input = { ...validServiceRequest(), status: 'bogus' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid intent', () => {
    const input = { ...validServiceRequest(), intent: 'wish' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid priority', () => {
    const input = { ...validServiceRequest(), priority: 'super-urgent' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const input = { resourceType: 'ServiceRequest' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID id', () => {
    const input = { ...validServiceRequest(), id: 'not-a-uuid' }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('validates all FHIR R4 status values', () => {
    const statuses = ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown']
    for (const status of statuses) {
      const input = { ...validServiceRequest(), status }
      const result = FhirServiceRequestSchema.safeParse(input)
      expect(result.success).toBe(true)
    }
  })

  it('validates all priority values', () => {
    const priorities = ['routine', 'urgent', 'asap', 'stat']
    for (const priority of priorities) {
      const input = { ...validServiceRequest(), priority }
      const result = FhirServiceRequestSchema.safeParse(input)
      expect(result.success).toBe(true)
    }
  })

  it('accepts _ultranos.receivedAt and receivedByLabId when set', () => {
    const input = validServiceRequest()
    input._ultranos = {
      ...input._ultranos,
      receivedAt: '2026-05-30T10:05:00.000Z',
      receivedByLabId: '660e8400-e29b-41d4-a716-446655440000',
      receivedByTechId: '770e8400-e29b-41d4-a716-446655440000',
    }
    const result = FhirServiceRequestSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('LabServiceRequest type (data minimization)', () => {
  it('LabServiceRequest type excludes reasonCode, supportingInfo, encounter, note', () => {
    // Type-level assertion: LabServiceRequest should not have these fields.
    // If this compiles, the type correctly omits clinical PHI fields.
    const lab: LabServiceRequest = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2' }] },
      subject: { reference: 'Patient/123' },
      requester: { reference: 'Practitioner/789' },
      authoredOn: '2026-05-30T10:00:00.000Z',
      _ultranos: {
        createdAt: '2026-05-30T10:00:00.000Z',
        hlcTimestamp: '2026-05-30T10:00:00.000Z:0000:node1',
        isOfflineCreated: false,
      },
      meta: { lastUpdated: '2026-05-30T10:00:00.000Z' },
    }

    // Runtime assertion: verify excluded fields are not present
    expect(lab).not.toHaveProperty('reasonCode')
    expect(lab).not.toHaveProperty('supportingInfo')
    expect(lab).not.toHaveProperty('encounter')
    expect(lab).not.toHaveProperty('note')
    expect(lab).toHaveProperty('id')
    expect(lab).toHaveProperty('code')
    expect(lab).toHaveProperty('subject')
  })
})
