import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('wholesale settings defaults', () => {
  it('wholesale mode is off by default', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.enableWholesale).toBe(false)
  })
  it('provides a default sales-order prefix', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.salesOrderPrefix).toBe('SO-')
  })
})
