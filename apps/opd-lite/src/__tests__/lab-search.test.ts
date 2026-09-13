import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { searchLabs } from '@/lib/lab-search'
import { searchLabsHub } from '@/lib/trpc'

vi.mock('@/lib/trpc', () => ({ searchLabsHub: vi.fn() }))

beforeEach(async () => {
  await db.open(); await db.labsMirror.clear()
  vi.stubGlobal('navigator', { onLine: false }) // force offline Fuse path by default
})

describe('searchLabs (offline mirror)', () => {
  it('finds a lab by name from the mirror', async () => {
    await db.labsMirror.bulkPut([
      { id: 'l1', name: 'Kabul Central Laboratory', status: 'active' },
      { id: 'l2', name: 'Herat Regional Lab', status: 'active' },
    ] as never[])
    const res = await searchLabs('kabul')
    expect(res[0]!.item.id).toBe('l1')
  })

  it('returns Fuse match indices so the dropdown can highlight matches', async () => {
    await db.labsMirror.bulkPut([
      { id: 'l1', name: 'Kabul Central Laboratory', status: 'active' },
    ] as never[])
    const res = await searchLabs('kabul')
    const nameMatch = res[0]!.matches?.find((m) => m.key === 'name')
    expect(nameMatch?.indices?.length).toBeGreaterThan(0)
  })

  it('returns [] for queries under 2 chars', async () => {
    expect(await searchLabs('k')).toEqual([])
  })
})

describe('searchLabs (online Hub path)', () => {
  it('keeps Hub rows and attaches highlight match indices (Hub returns none)', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.mocked(searchLabsHub).mockResolvedValue([
      { id: 'l1', name: 'Kabul Central Laboratory', status: 'active' },
    ] as never)

    const res = await searchLabs('kabul')
    expect(res).toHaveLength(1)
    expect(res[0]!.item.id).toBe('l1')
    // The Hub returns no match indices — searchLabs must add them client-side.
    expect(res[0]!.matches?.find((m) => m.key === 'name')?.indices?.length).toBeGreaterThan(0)
  })
})
