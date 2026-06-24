import { describe, it, expect, beforeEach } from 'vitest'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'

const rx = (id: string): VerifiedPrescription =>
  ({ id, med: 'J01CA04', atc: 'J01CA04', medN: 'Amoxicillin', medT: 'Amoxicillin 500mg', dos: { qty: 1, unit: 'capsule' }, dur: 7, req: 'r', pat: 'p', at: '2026-06-24T00:00:00Z' })

beforeEach(() => {
  useFulfillmentStore.setState({ items: [{ prescription: rx('rx-1'), selected: true, brandName: '', batchLot: '' }] } as never)
})

describe('fulfillment substitution state', () => {
  it('records a brand selection (id + name + presentation)', () => {
    useFulfillmentStore.getState().setBrandSelection('rx-1', { brandId: 'b-1', brandName: 'Amoxil', presentationId: 'p-1' })
    const item = useFulfillmentStore.getState().items[0]!
    expect(item.brandId).toBe('b-1')
    expect(item.brandName).toBe('Amoxil')
    expect(item.presentationId).toBe('p-1')
  })
})
