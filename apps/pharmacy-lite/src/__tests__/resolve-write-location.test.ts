import { describe, it, expect } from 'vitest'
import { resolveWriteLocation } from '@/lib/inventory/resolve-write-location'
import type { StockLocation } from '@/lib/inventory/types'

const loc = (over: Partial<StockLocation>): StockLocation => ({
  id: 'x', facilityId: 'f1', name: 'X', kind: 'store', isPrimary: false, isActive: true, lastSyncedAt: 'h', ...over,
})
const locs = [loc({ id: 'main', isPrimary: true }), loc({ id: 'fridge' }), loc({ id: 'old', isActive: false })]

describe('resolveWriteLocation', () => {
  it('keeps a valid active current selection', () => {
    expect(resolveWriteLocation('fridge', locs)).toBe('fridge')
  })
  it('resolves ALL to the primary', () => {
    expect(resolveWriteLocation('ALL', locs)).toBe('main')
  })
  it('resolves empty to the primary', () => {
    expect(resolveWriteLocation('', locs)).toBe('main')
  })
  it('resolves an inactive/unknown id to the primary', () => {
    expect(resolveWriteLocation('old', locs)).toBe('main')
    expect(resolveWriteLocation('ghost', locs)).toBe('main')
  })
  it('passes through the default fallback', () => {
    expect(resolveWriteLocation('default', locs)).toBe('default')
  })
  it('falls back to default when no primary is cached', () => {
    expect(resolveWriteLocation('ALL', [loc({ id: 'a' }), loc({ id: 'b' })])).toBe('default')
    expect(resolveWriteLocation('ALL', [])).toBe('default')
  })
})
