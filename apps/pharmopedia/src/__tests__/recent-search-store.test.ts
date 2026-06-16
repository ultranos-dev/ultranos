import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store[k] ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store[k] = v }),
}))

import { useRecentSearchStore } from '@/store/recent-search-store'

describe('recent-search-store', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useRecentSearchStore.setState({ recents: [], initialized: false })
  })

  it('adds queries most-recent-first', async () => {
    await useRecentSearchStore.getState().add('amox')
    await useRecentSearchStore.getState().add('paracetamol')
    expect(useRecentSearchStore.getState().recents).toEqual(['paracetamol', 'amox'])
  })

  it('dedupes case-insensitively and moves the match to the front', async () => {
    await useRecentSearchStore.getState().add('Amox')
    await useRecentSearchStore.getState().add('metformin')
    await useRecentSearchStore.getState().add('amox')
    expect(useRecentSearchStore.getState().recents).toEqual(['amox', 'metformin'])
  })

  it('ignores blank queries', async () => {
    await useRecentSearchStore.getState().add('   ')
    expect(useRecentSearchStore.getState().recents).toEqual([])
  })

  it('caps at 10', async () => {
    for (let i = 0; i < 12; i++) await useRecentSearchStore.getState().add(`q${i}`)
    expect(useRecentSearchStore.getState().recents).toHaveLength(10)
    expect(useRecentSearchStore.getState().recents[0]).toBe('q11')
  })

  it('clear empties the list', async () => {
    await useRecentSearchStore.getState().add('amox')
    await useRecentSearchStore.getState().clear()
    expect(useRecentSearchStore.getState().recents).toEqual([])
  })

  it('init loads persisted recents', async () => {
    store['pharmopedia.recent-searches'] = JSON.stringify(['a', 'b'])
    await useRecentSearchStore.getState().init()
    expect(useRecentSearchStore.getState().recents).toEqual(['a', 'b'])
  })
})
