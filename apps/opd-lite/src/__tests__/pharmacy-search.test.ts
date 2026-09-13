import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { searchPharmacies } from '@/lib/pharmacy-search'
import { searchPharmaciesHub } from '@/lib/trpc'

vi.mock('@/lib/trpc', () => ({ searchPharmaciesHub: vi.fn() }))

beforeEach(async () => {
  await db.open(); await db.pharmaciesMirror.clear()
  vi.stubGlobal('navigator', { onLine: false }) // force offline Fuse path by default
})

describe('searchPharmacies (offline mirror)', () => {
  it('finds a pharmacy by name from the mirror', async () => {
    await db.pharmaciesMirror.bulkPut([
      { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', facilityType: 'pharmacy' },
      { id: 'p2', name: 'Herat Central Drug Store', province: 'Herat', facilityType: 'pharmacy' },
    ] as never[])
    const res = await searchPharmacies('kabul')
    expect(res[0]!.item.id).toBe('p1')
  })

  it('returns Fuse match indices so the dropdown can highlight matches', async () => {
    await db.pharmaciesMirror.bulkPut([
      { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', facilityType: 'pharmacy' },
    ] as never[])
    const res = await searchPharmacies('kabul')
    const nameMatch = res[0]!.matches?.find((m) => m.key === 'name')
    expect(nameMatch?.indices?.length).toBeGreaterThan(0)
  })

  it('returns [] for queries under 2 chars', async () => {
    expect(await searchPharmacies('k')).toEqual([])
  })
})

describe('searchPharmacies (online Hub path)', () => {
  it('keeps Hub rows and attaches highlight match indices (Hub returns none)', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.mocked(searchPharmaciesHub).mockResolvedValue([
      { id: 'p1', name: 'Kabul City Pharmacy', facilityType: 'pharmacy' },
    ] as never)

    const res = await searchPharmacies('kabul')
    expect(res).toHaveLength(1)
    expect(res[0]!.item.id).toBe('p1')
    // The Hub returns no match indices — searchPharmacies must add them client-side.
    expect(res[0]!.matches?.find((m) => m.key === 'name')?.indices?.length).toBeGreaterThan(0)
  })
})
