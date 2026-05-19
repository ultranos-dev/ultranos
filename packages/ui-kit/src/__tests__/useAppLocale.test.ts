import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getDirection, useAppLocale } from '../hooks/useAppLocale'

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: vi.fn(() => 'en'),
}))

// Mock next/navigation
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

describe('getDirection', () => {
  it('returns ltr for English', () => {
    expect(getDirection('en')).toBe('ltr')
  })

  it('returns rtl for Arabic', () => {
    expect(getDirection('ar')).toBe('rtl')
  })

  it('returns rtl for Dari', () => {
    expect(getDirection('prs')).toBe('rtl')
  })

  it('returns ltr for unknown locales', () => {
    expect(getDirection('fr')).toBe('ltr')
    expect(getDirection('')).toBe('ltr')
  })
})

describe('useAppLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear cookies
    document.cookie = 'NEXT_LOCALE=;max-age=0'
  })

  it('returns current locale and direction', () => {
    const { result } = renderHook(() => useAppLocale())
    expect(result.current.locale).toBe('en')
    expect(result.current.dir).toBe('ltr')
    expect(typeof result.current.setLocale).toBe('function')
  })

  it('setLocale sets NEXT_LOCALE cookie and refreshes router', () => {
    const { result } = renderHook(() => useAppLocale())

    act(() => {
      result.current.setLocale('ar')
    })

    expect(document.cookie).toContain('NEXT_LOCALE=ar')
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('setLocale sets cookie with SameSite=Lax', () => {
    const { result } = renderHook(() => useAppLocale())

    act(() => {
      result.current.setLocale('prs')
    })

    expect(document.cookie).toContain('NEXT_LOCALE=prs')
  })
})
