import { describe, it, expect, vi } from 'vitest'
import { createMedicationDispense } from '@/lib/medication-dispense'
import { buildRecordDispensePayload } from '@/lib/dispense-sync'
import type { FulfillmentItem } from '@/stores/fulfillment-store'

// Minimal valid FulfillmentItem — shape derived from medication-dispense.ts item usage:
// prescription.{id, pat, med, medN, medT, dos:{qty,unit,freqN?,perU?}, dur}
const item: FulfillmentItem = {
  prescription: {
    id: 'rx-test-001',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 1, unit: 'capsule', freqN: 2, per: 1, perU: 'd' },
    dur: 7,
    enc: 'enc-test-001',
    req: 'pract-001',
    pat: 'pat-test-001',
    at: '2026-09-08T08:00:00Z',
  },
  selected: true,
  brandName: '',
  batchLot: '',
} as never

const OVERRIDE = {
  reason: 'chronic med, benefit outweighs risk',
  supervisorName: 'Dr. Sahar',
  reasonCode: 'BENEFIT_OUTWEIGHS_RISK',
  supervisorId: '11111111-1111-1111-1111-111111111111',
  supervisorPin: '4321',
}

describe('dispense override → review', () => {
  it('createMedicationDispense records the structured reviewOverride in _ultranos when provided', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1', undefined, { override: OVERRIDE })
    expect(d._ultranos.reviewOverride).toEqual(OVERRIDE)
  })

  it('omits reviewOverride when no override is given', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1')
    expect(d._ultranos.reviewOverride).toBeUndefined()
  })

  it('the sync payload carries structured override (reason code + supervisor credential) only when overridden', () => {
    const withOverride = createMedicationDispense(item, 'Practitioner/p1', undefined, { override: OVERRIDE })
    const p1 = buildRecordDispensePayload(withOverride)
    // Free text is supplementary (supervisor name + reason)
    expect(p1.overrideReason).toContain('Dr. Sahar')
    expect(p1.overrideReason).toContain('chronic med')
    // Structured classifier + real credential are sent for server verification
    expect(p1.overrideReasonCode).toBe('BENEFIT_OUTWEIGHS_RISK')
    expect(p1.supervisorAuth).toEqual({
      supervisorId: OVERRIDE.supervisorId,
      supervisorPin: OVERRIDE.supervisorPin,
    })
    // NOT attested offline (navigator.onLine defaults true in jsdom)
    expect(p1.overrideAttestedOffline).toBeUndefined()

    const clean = createMedicationDispense(item, 'Practitioner/p1')
    const cleanPayload = buildRecordDispensePayload(clean)
    expect(cleanPayload.overrideReason).toBeUndefined()
    expect(cleanPayload.overrideReasonCode).toBeUndefined()
    expect(cleanPayload.supervisorAuth).toBeUndefined()
  })

  it('marks the payload as attested-offline when the override was captured offline', () => {
    const offlineOverride = createMedicationDispense(item, 'Practitioner/p1', undefined, {
      override: { ...OVERRIDE, attestedOffline: true },
    })
    expect(buildRecordDispensePayload(offlineOverride).overrideAttestedOffline).toBe(true)
  })
})
