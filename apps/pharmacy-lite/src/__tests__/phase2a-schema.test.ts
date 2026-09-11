import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('phase 2a settings defaults', () => {
  it('adds PO-number + WAC settings defaults', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.poNumberPrefix).toBe('PO-')
    expect(DEFAULT_PHARMACY_SETTINGS.pharmacyCode).toBe('')
    expect(DEFAULT_PHARMACY_SETTINGS.poSequenceNext).toBe(1)
  })
})
