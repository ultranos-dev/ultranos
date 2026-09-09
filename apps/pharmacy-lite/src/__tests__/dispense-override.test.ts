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

describe('dispense override → review', () => {
  it('createMedicationDispense records reviewOverride in _ultranos when provided', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1', undefined, {
      override: { reason: 'chronic med, benefit outweighs risk', supervisorName: 'Dr. Sahar' },
    })
    expect(d._ultranos.reviewOverride).toEqual({
      reason: 'chronic med, benefit outweighs risk',
      supervisorName: 'Dr. Sahar',
    })
  })

  it('omits reviewOverride when no override is given', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1')
    expect(d._ultranos.reviewOverride).toBeUndefined()
  })

  it('the sync payload carries overrideReason text (supervisor name + reason) only when overridden', () => {
    const withOverride = createMedicationDispense(item, 'Practitioner/p1', undefined, {
      override: { reason: 'R', supervisorName: 'Dr. S' },
    })
    const p1 = buildRecordDispensePayload(withOverride)
    expect(p1.overrideReason).toContain('Dr. S')
    expect(p1.overrideReason).toContain('R')

    const clean = createMedicationDispense(item, 'Practitioner/p1')
    expect(buildRecordDispensePayload(clean).overrideReason).toBeUndefined()
  })
})
