import { describe, it, expect } from 'vitest'
import { computeSuggestedQty } from '@/lib/procurement/reorder'

describe('computeSuggestedQty', () => {
  it('uses reorderQuantity when set', () => {
    expect(computeSuggestedQty({ reorderQuantity: 50, maxStock: 100, reorderPoint: 10 }, 3)).toBe(50)
  })
  it('falls back to maxStock - onHand', () => {
    expect(computeSuggestedQty({ maxStock: 100, reorderPoint: 10 }, 30)).toBe(70)
  })
  it('falls back to reorderPoint - onHand when no maxStock', () => {
    expect(computeSuggestedQty({ reorderPoint: 10 }, 4)).toBe(6)
  })
  it('clamps to 0 (never negative when onHand exceeds maxStock)', () => {
    expect(computeSuggestedQty({ maxStock: 20, reorderPoint: 10 }, 25)).toBe(0)
  })
  it('raises the result to the MOQ', () => {
    expect(computeSuggestedQty({ reorderPoint: 10 }, 8, 25)).toBe(25) // gap 2 → raised to 25
  })
})
