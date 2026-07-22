import { describe, it, expect, vi } from 'vitest'
import { runBrandsSync } from '@/sync/brands-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'

const brand = (v: number): DrugBrand => ({ id: `b${v}`, genericAtcCode: 'J01CR02', brandName: `Brand${v}`, brandNameLocal: {}, rxStatus: 'unknown', version: v, lastUpdated: '' })
const pres = (v: number): DrugBrandPresentation => ({ id: `p${v}`, brandId: 'b1', registrationStatus: 'unknown', version: v, lastUpdated: '' })

describe('runBrandsSync', () => {
  it('pages brands then presentations, upserts each batch, advances both watermarks', async () => {
    const meta: Record<string, string> = {}
    const upsertBrands = vi.fn(async () => {})
    const upsertPresentations = vi.fn(async () => {})

    // One page of brands, then empty; one page of presentations, then empty.
    const fetchBrands = vi.fn()
      .mockResolvedValueOnce({ brands: [brand(101), brand(102)], latestVersion: 102 })
      .mockResolvedValueOnce({ brands: [], latestVersion: 102 })
    const fetchPresentations = vi.fn()
      .mockResolvedValueOnce({ presentations: [pres(201)], latestVersion: 201 })
      .mockResolvedValueOnce({ presentations: [], latestVersion: 201 })

    const res = await runBrandsSync({} as never, 'tok', {
      fetchBrands, fetchPresentations, upsertBrands, upsertPresentations,
      getMeta: async (_db, k) => meta[k] ?? null,
      setMeta: async (_db, k, v) => { meta[k] = v },
    })

    expect(res.brands).toBe(2)
    expect(res.presentations).toBe(1)
    expect(upsertBrands).toHaveBeenCalledTimes(1)
    expect(upsertPresentations).toHaveBeenCalledTimes(1)
    expect(meta.brandsVersion).toBe('102')
    expect(meta.presentationsVersion).toBe('201')
  })

  it('resumes brands from the stored watermark', async () => {
    const meta: Record<string, string> = { brandsVersion: '500', presentationsVersion: '600' }
    const fetchBrands = vi.fn().mockResolvedValue({ brands: [], latestVersion: 500 })
    const fetchPresentations = vi.fn().mockResolvedValue({ presentations: [], latestVersion: 600 })

    await runBrandsSync({} as never, 'tok', {
      fetchBrands, fetchPresentations,
      upsertBrands: async () => {}, upsertPresentations: async () => {},
      getMeta: async (_db, k) => meta[k] ?? null,
      setMeta: async (_db, k, v) => { meta[k] = v },
    })

    expect(fetchBrands.mock.calls[0][0]).toBe(500)
    expect(fetchPresentations.mock.calls[0][0]).toBe(600)
  })

  it('THROWS when the brands server returns entries but the version did not advance (stall guard)', async () => {
    const upsertBrands = vi.fn(async () => {})
    // Non-empty page whose latestVersion did NOT advance past `since` (0).
    const fetchBrands = vi.fn().mockResolvedValue({ brands: [brand(1), brand(2)], latestVersion: 0 })
    const fetchPresentations = vi.fn().mockResolvedValue({ presentations: [], latestVersion: 0 })

    await expect(
      runBrandsSync({} as never, 'tok', {
        fetchBrands, fetchPresentations, upsertBrands, upsertPresentations: async () => {},
        getMeta: async () => null,
        setMeta: async () => {},
      }),
    ).rejects.toThrow(/stalled/i)
    // Must not have silently truncated by upserting the stalled page.
    expect(upsertBrands).not.toHaveBeenCalled()
  })

  it('THROWS when the presentations server returns entries but the version did not advance (stall guard)', async () => {
    const upsertPresentations = vi.fn(async () => {})
    // Brands complete cleanly; presentations stall on a non-empty non-advancing page.
    const fetchBrands = vi.fn().mockResolvedValue({ brands: [], latestVersion: 0 })
    const fetchPresentations = vi.fn().mockResolvedValue({ presentations: [pres(1), pres(2)], latestVersion: 0 })

    await expect(
      runBrandsSync({} as never, 'tok', {
        fetchBrands, fetchPresentations, upsertBrands: async () => {}, upsertPresentations,
        getMeta: async () => null,
        setMeta: async () => {},
      }),
    ).rejects.toThrow(/stalled/i)
    expect(upsertPresentations).not.toHaveBeenCalled()
  })
})
