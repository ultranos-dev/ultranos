import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { BrandResultCard } from '@/components/BrandResultCard'
import type { BrandSearchResult } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', borderSubtle: '#eee', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary50: '#edfaf4', primary100: '#d0f3e5', primary600: '#237d5a', primary700: '#1c6248' }),
}))
vi.mock('@/store/lang-store', () => ({ isRtlLang: (l: string) => ['ar', 'prs', 'ps'].includes(l) }))
const mockToggleBrand = vi.fn()
vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (sel: (s: { isBrandBookmarked: (id: string) => boolean; toggleBrand: typeof mockToggleBrand }) => unknown) =>
    sel({ isBrandBookmarked: () => false, toggleBrand: mockToggleBrand }),
}))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react'); const { View } = require('react-native')
  return { Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) => React.createElement(View, { testID }, children) }
})

const RESULT: BrandSearchResult = {
  id: 'b1', brandName: 'SNOCIP', manufacturer: 'Snow Pharma',
  genericAtcCode: 'J01MA02', genericInnName: 'Ciprofloxacin', doseForm: 'tablet',
  referencePrice: 54.4, currency: 'AFN',
}

describe('BrandResultCard', () => {
  it('shows brand name, generic, manufacturer and price', () => {
    render(<BrandResultCard result={RESULT} lang="en" onPress={vi.fn()} />)
    expect(screen.getByText('SNOCIP')).toBeTruthy()
    expect(screen.getByText(/Ciprofloxacin/)).toBeTruthy()
    expect(screen.getByText('Snow Pharma')).toBeTruthy()
    expect(screen.getByText(/54.4 AFN/)).toBeTruthy()
  })

  it('omits the price pill when there is no reference price', () => {
    render(<BrandResultCard result={{ ...RESULT, referencePrice: undefined, currency: undefined }} lang="en" onPress={vi.fn()} />)
    expect(screen.queryByTestId('brand-result-price')).toBeNull()
  })

  it('fires onPress', () => {
    const onPress = vi.fn()
    render(<BrandResultCard result={RESULT} lang="en" onPress={onPress} />)
    fireEvent.press(screen.getByTestId('brand-result-b1'))
    expect(onPress).toHaveBeenCalled()
  })

  it('bookmarks the brand via the heart toggle', () => {
    mockToggleBrand.mockClear()
    render(<BrandResultCard result={RESULT} lang="en" onPress={vi.fn()} />)
    fireEvent.press(screen.getByTestId('brand-bookmark-toggle'))
    expect(mockToggleBrand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'b1', brandName: 'SNOCIP' }))
  })
})
