import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

import * as SecureStore from 'expo-secure-store'
import { useCoachMarkStore } from '@/store/coach-mark-store'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
  useCoachMarkStore.setState({ dismissed: new Set(), initialized: false })
})

describe('coach-mark-store', () => {
  it('initializes with empty dismissed set', () => {
    const s = useCoachMarkStore.getState()
    expect(s.dismissed.size).toBe(0)
    expect(s.initialized).toBe(false)
  })

  it('init loads dismissed keys from SecureStore', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('browse-class,detail-bookmark')

    await useCoachMarkStore.getState().init()

    const s = useCoachMarkStore.getState()
    expect(s.dismissed.has('browse-class')).toBe(true)
    expect(s.dismissed.has('detail-bookmark')).toBe(true)
    expect(s.initialized).toBe(true)
  })

  it('dismiss adds key and persists', async () => {
    await useCoachMarkStore.getState().init()
    await useCoachMarkStore.getState().dismiss('browse-class')

    expect(useCoachMarkStore.getState().dismissed.has('browse-class')).toBe(true)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      '@pharmopedia/coach-dismissed',
      'browse-class',
    )
  })

  it('shouldShow returns false for dismissed keys', async () => {
    await useCoachMarkStore.getState().init()
    await useCoachMarkStore.getState().dismiss('browse-class')

    const s = useCoachMarkStore.getState()
    expect(s.shouldShow('browse-class')).toBe(false)
    expect(s.shouldShow('detail-bookmark')).toBe(true)
  })

  it('reset clears all dismissed keys', async () => {
    await useCoachMarkStore.getState().init()
    await useCoachMarkStore.getState().dismiss('browse-class')
    await useCoachMarkStore.getState().reset()

    expect(useCoachMarkStore.getState().dismissed.size).toBe(0)
  })
})
