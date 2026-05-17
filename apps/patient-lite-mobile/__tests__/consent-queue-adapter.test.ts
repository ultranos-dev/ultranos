import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'
import { consentToEnqueueInput, _resetHlc } from '@/lib/consent-queue-adapter'

function createMockConsent(id: string): FhirConsent {
  return {
    id,
    resourceType: 'Consent',
    status: ConsentStatus.ACTIVE,
    scope: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
    },
    category: [ConsentScope.PRESCRIPTIONS],
    patient: { reference: `Patient/patient-001` },
    dateTime: '2026-05-12T00:00:00.000Z',
    provision: { period: { start: '2026-05-12T00:00:00.000Z' } },
    _ultranos: {
      grantorId: 'patient-001',
      grantorRole: GrantorRole.SELF,
      purpose: ConsentPurpose.TREATMENT,
      validFrom: '2026-05-12T00:00:00.000Z',
      consentVersion: '1.0',
      auditHash: '0'.repeat(64),
      createdAt: '2026-05-12T00:00:00.000Z',
    },
    meta: { lastUpdated: '2026-05-12T00:00:00.000Z' },
  }
}

describe('consent-queue-adapter', () => {
  beforeEach(() => {
    _resetHlc()
  })

  it('converts FhirConsent to EnqueueSyncActionInput', () => {
    const consent = createMockConsent('c1')
    const input = consentToEnqueueInput(consent)

    expect(input.resourceType).toBe('Consent')
    expect(input.resourceId).toBe('c1')
    expect(input.action).toBe('create')
    expect(input.payload).toEqual(expect.objectContaining({
      id: 'c1',
      resourceType: 'Consent',
      status: ConsentStatus.ACTIVE,
    }))
  })

  it('generates an HLC timestamp string', () => {
    const consent = createMockConsent('c2')
    const input = consentToEnqueueInput(consent)

    // HLC format: 15-digit wallMs + ":" + 5-digit counter + ":" + nodeId
    expect(input.hlcTimestamp).toMatch(/^\d{15}:\d{5}:.+$/)
  })

  it('deep-copies the consent payload (no shared references)', () => {
    const consent = createMockConsent('c3')
    const input = consentToEnqueueInput(consent)

    // Mutating original should not affect the input payload
    consent.id = 'mutated'
    expect(input.payload.id).toBe('c3')
  })

  it('increments HLC counter for rapid successive calls', () => {
    const c1 = consentToEnqueueInput(createMockConsent('a'))
    const c2 = consentToEnqueueInput(createMockConsent('b'))

    // Both should have valid timestamps; second should be >= first
    expect(c2.hlcTimestamp >= c1.hlcTimestamp).toBe(true)
  })
})
