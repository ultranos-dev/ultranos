import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signPrescriptionBundle, type SignedPrescriptionBundle } from '@/lib/prescription-signing'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

// Mock the sync-engine crypto module
vi.mock('@ultranos/sync-engine', () => ({
  signPayload: vi.fn(async (payload: string, _key: Uint8Array) => {
    // Return a deterministic 64-byte signature for testing
    return new Uint8Array(64).fill(0xab)
  }),
}))

function makeMockRx(overrides?: Partial<FhirMedicationRequestZod>): FhirMedicationRequestZod {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:formulary', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg (Capsule)',
    },
    subject: { reference: 'Patient/p-123' },
    encounter: { reference: 'Encounter/e-456' },
    requester: { reference: 'Practitioner/dr-789' },
    authoredOn: '2026-04-29T10:00:00.000Z',
    dosageInstruction: [
      {
        sequence: 1,
        text: '1 capsule, TID, for 7 days',
        timing: {
          repeat: { frequency: 3, period: 1, periodUnit: 'd' },
          code: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation', code: 'TID', display: 'Three times daily' }] },
        },
        doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }],
      },
    ],
    dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
    _ultranos: {
      prescriptionStatus: 'ACTIVE' as never,
      interactionCheckResult: 'CLEAR',
      isOfflineCreated: true,
      hlcTimestamp: '000001746000000000:00001:node1',
      createdAt: '2026-04-29T10:00:00.000Z',
    },
    meta: { lastUpdated: '2026-04-29T10:00:00.000Z', versionId: '1' },
    ...overrides,
  }
}

describe('signPrescriptionBundle', () => {
  const mockPrivateKey = new Uint8Array(32).fill(0x01)
  const mockPublicKey = new Uint8Array(32).fill(0x02)

  it('returns a signed bundle with payload, signature, public key, and envelope', async () => {
    const rx = makeMockRx()
    const bundle = await signPrescriptionBundle([rx], mockPrivateKey, mockPublicKey)

    expect(bundle).toHaveProperty('payload')
    expect(bundle).toHaveProperty('sig')
    expect(bundle).toHaveProperty('pub')
    expect(bundle).toHaveProperty('issued_at')
    expect(bundle).toHaveProperty('expiry')
    expect(typeof bundle.payload).toBe('string')
    expect(typeof bundle.sig).toBe('string')
    expect(typeof bundle.pub).toBe('string')
  })

  it('signature is base64-encoded', async () => {
    const rx = makeMockRx()
    const bundle = await signPrescriptionBundle([rx], mockPrivateKey, mockPublicKey)

    // Should be valid base64
    const decoded = Uint8Array.from(atob(bundle.sig), (c) => c.charCodeAt(0))
    expect(decoded.length).toBe(64)
  })

  it('public key is base64-encoded', async () => {
    const rx = makeMockRx()
    const bundle = await signPrescriptionBundle([rx], mockPrivateKey, mockPublicKey)

    const decoded = Uint8Array.from(atob(bundle.pub), (c) => c.charCodeAt(0))
    expect(decoded.length).toBe(32)
  })

  it('issued_at is a valid ISO timestamp and expiry is 30 days later', async () => {
    const rx = makeMockRx()
    const bundle = await signPrescriptionBundle([rx], mockPrivateKey, mockPublicKey)

    const issued = new Date(bundle.issued_at)
    const expiry = new Date(bundle.expiry)
    expect(issued.getTime()).not.toBeNaN()
    expect(expiry.getTime()).not.toBeNaN()

    const diffDays = (expiry.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(30)
  })

  it('payload contains compressed prescription data', async () => {
    const rx = makeMockRx()
    const bundle = await signPrescriptionBundle([rx], mockPrivateKey, mockPublicKey)

    expect(bundle.payload).toContain('AMX500')
    expect(bundle.payload).toContain('Amoxicillin')
  })

  it('throws if no prescriptions provided', async () => {
    await expect(signPrescriptionBundle([], mockPrivateKey, mockPublicKey)).rejects.toThrow()
  })
})
