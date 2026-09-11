import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { searchPharmacies } from '@/lib/pharmacy-search'

beforeEach(async () => {
  await db.open(); await db.pharmaciesMirror.clear()
  vi.stubGlobal('navigator', { onLine: false }) // force offline Fuse path
})

describe('searchPharmacies (offline mirror)', () => {
  it('finds a pharmacy by name from the mirror', async () => {
    await db.pharmaciesMirror.bulkPut([
      { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', facilityType: 'pharmacy' },
      { id: 'p2', name: 'Herat Central Drug Store', province: 'Herat', facilityType: 'pharmacy' },
    ] as never[])
    const res = await searchPharmacies('kabul')
    expect(res[0]!.id).toBe('p1')
  })

  it('returns [] for queries under 2 chars', async () => {
    expect(await searchPharmacies('k')).toEqual([])
  })
})
