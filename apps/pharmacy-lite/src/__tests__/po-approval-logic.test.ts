import { describe, it, expect } from 'vitest'
import { requiresApproval } from '@/lib/procurement/po-approval'

describe('requiresApproval', () => {
  it('is off when threshold is 0 or negative', () => {
    expect(requiresApproval(100000, 0)).toBe(false)
    expect(requiresApproval(100000, -5)).toBe(false)
  })
  it('is false below the threshold, true at or above', () => {
    expect(requiresApproval(499, 500)).toBe(false)
    expect(requiresApproval(500, 500)).toBe(true)
    expect(requiresApproval(501, 500)).toBe(true)
  })
})
