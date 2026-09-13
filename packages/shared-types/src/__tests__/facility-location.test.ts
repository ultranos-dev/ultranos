import { describe, it, expect } from 'vitest'
import type { FacilityLocation, FacilityLocationKind } from '../index.js'

describe('FacilityLocation type', () => {
  it('accepts a well-formed sub-location value', () => {
    const kinds: FacilityLocationKind[] = ['store', 'room', 'fridge', 'cabinet', 'other']
    const loc: FacilityLocation = {
      id: 'l1', facilityId: 'f1', name: 'Main store', kind: 'store',
      isPrimary: true, isActive: true,
    }
    expect(loc.kind).toBe('store')
    expect(kinds).toContain(loc.kind)
    expect(loc.isPrimary).toBe(true)
  })
})
