import { describe, it, expect } from 'vitest'
import type { PharmacyDirectoryEntry } from '../fhir/drug-catalog'

describe('PharmacyDirectoryEntry', () => {
  it('accepts a directory row shape', () => {
    const e: PharmacyDirectoryEntry = {
      id: 'p1', name: 'Kabul City Pharmacy', address: 'Shahr-e Naw',
      province: 'Kabul', district: 'District 10', facilityType: 'pharmacy',
      updatedAt: '2026-09-10T00:00:00Z',
    }
    expect(e.facilityType).toBe('pharmacy')
  })
})
