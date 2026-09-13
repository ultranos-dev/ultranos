import { describe, it, expect } from 'vitest'
import { FhirServiceRequestSchema, type LabDirectoryEntry } from '../fhir/service-request.schema'

const base = {
  id: '11111111-1111-1111-1111-111111111111',
  resourceType: 'ServiceRequest' as const,
  status: 'active' as const,
  intent: 'order' as const,
  code: { text: 'CBC' },
  subject: { reference: 'Patient/p1' },
  requester: { reference: 'Practitioner/d1' },
  authoredOn: '2026-09-12T00:00:00.000Z',
  _ultranos: { createdAt: '2026-09-12T00:00:00.000Z', hlcTimestamp: '1:0:n', isOfflineCreated: true },
  meta: { lastUpdated: '2026-09-12T00:00:00.000Z', versionId: '1' },
}

describe('ServiceRequest performer', () => {
  it('accepts an optional performer (Organization reference) and retains it', () => {
    const withPerformer = { ...base, performer: { reference: 'Organization/lab1', display: 'Central Lab' } }
    const parsed = FhirServiceRequestSchema.parse(withPerformer)
    expect(parsed.performer?.reference).toBe('Organization/lab1')
    expect(parsed.performer?.display).toBe('Central Lab')
  })

  it('still validates without a performer', () => {
    expect(FhirServiceRequestSchema.safeParse(base).success).toBe(true)
  })
})

describe('LabDirectoryEntry', () => {
  it('accepts a directory row shape', () => {
    const e: LabDirectoryEntry = {
      id: 'lab1', name: 'Central Lab', status: 'ACTIVE',
      accreditationRef: 'ACC-1', updatedAt: '2026-09-12T00:00:00Z',
    }
    expect(e.name).toBe('Central Lab')
  })
})
