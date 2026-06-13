import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('react-native', () => ({
  I18nManager: {
    allowRTL: vi.fn(),
    forceRTL: vi.fn(),
  },
}))

vi.mock('expo-updates', () => ({
  reloadAsync: vi.fn().mockResolvedValue(undefined),
}))

const { isRtlLang, useLangStore } = await import('@/store/lang-store')

describe('isRtlLang', () => {
  it('returns false for en', () => expect(isRtlLang('en')).toBe(false))
  it('returns true for prs', () => expect(isRtlLang('prs')).toBe(true))
  it('returns true for ps', () => expect(isRtlLang('ps')).toBe(true))
  it('returns true for ar', () => expect(isRtlLang('ar')).toBe(true))
})

describe('useLangStore.init', () => {
  beforeEach(async () => {
    useLangStore.setState({ lang: 'en', initialized: false })
    const { getItemAsync } = await import('expo-secure-store') as { getItemAsync: ReturnType<typeof vi.fn> }
    getItemAsync.mockResolvedValue(null)
  })

  it('defaults to en when no stored value', async () => {
    await useLangStore.getState().init()
    expect(useLangStore.getState().lang).toBe('en')
    expect(useLangStore.getState().initialized).toBe(true)
  })

  it('restores persisted lang', async () => {
    const { getItemAsync } = await import('expo-secure-store') as { getItemAsync: ReturnType<typeof vi.fn> }
    getItemAsync.mockResolvedValueOnce('ar')
    await useLangStore.getState().init()
    expect(useLangStore.getState().lang).toBe('ar')
  })
})

describe('useLangStore.setLang', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', initialized: true })
  })

  it('persists lang to SecureStore', async () => {
    const { setItemAsync } = await import('expo-secure-store') as { setItemAsync: ReturnType<typeof vi.fn> }
    await useLangStore.getState().setLang('prs')
    expect(setItemAsync).toHaveBeenCalledWith('@pharmopedia/lang', 'prs')
  })

  it('calls reloadAsync when RTL direction changes', async () => {
    await useLangStore.getState().setLang('en')
    const { reloadAsync } = await import('expo-updates') as { reloadAsync: ReturnType<typeof vi.fn> }
    reloadAsync.mockClear()
    await useLangStore.getState().setLang('ar')
    expect(reloadAsync).toHaveBeenCalledOnce()
  })

  it('does NOT call reloadAsync when RTL direction stays the same', async () => {
    await useLangStore.getState().setLang('prs')
    const { reloadAsync } = await import('expo-updates') as { reloadAsync: ReturnType<typeof vi.fn> }
    reloadAsync.mockClear()
    await useLangStore.getState().setLang('ar') // prs→ar: both RTL, no change
    expect(reloadAsync).not.toHaveBeenCalled()
  })
})
