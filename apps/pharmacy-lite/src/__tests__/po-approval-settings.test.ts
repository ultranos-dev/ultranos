import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('poApprovalThreshold setting', () => {
  it('defaults to 0 (approval off)', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.poApprovalThreshold).toBe(0)
  })
})
