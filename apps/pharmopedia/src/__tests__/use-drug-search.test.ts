import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ fts: vi.fn(), api: vi.fn() }))
vi.mock('@/db/fts', () => ({ searchDrugs: h.fts }))
vi.mock('@/api/drug-catalog', () => ({ searchDrugsApi: h.api }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: string | null }) => unknown) => s({ token: 'tok' }) }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
import { useDrugSearch } from '@/hooks/useDrugSearch'

const ROW = { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'X', localName: undefined }

describe('useDrugSearch', () => {
  beforeEach(() => vi.clearAllMocks())
  it('runs local FTS when catalog is synced', async () => {
    h.fts.mockResolvedValue([ROW])
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    await waitFor(() => expect(result.current.results).toEqual([ROW]))
    expect(h.fts).toHaveBeenCalledWith(expect.anything(), 'amox', 'en', 50)
    expect(h.api).not.toHaveBeenCalled()
    expect(result.current.query).toBe('amox')
  })
  it('clears results on empty query', async () => {
    h.fts.mockResolvedValue([ROW])
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    await act(async () => { await result.current.search('') })
    expect(result.current.results).toEqual([])
  })
  it('clears results on search failure', async () => {
    h.fts.mockRejectedValue(new Error('db'))
    const { result } = renderHook(() => useDrugSearch())
    await act(async () => { await result.current.search('amox') })
    expect(result.current.results).toEqual([])
  })
})
