import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#ffffff',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textMuted: '#9ca3af',
    surfaceSubtle: '#f3f4f6',
  }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string }) => unknown) => selector({ lang: 'en' }),
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'search.placeholder': 'Search drugs\u2026',
    }[key] ?? key),
  }),
}))

import { SearchBar } from '@/components/SearchBar'

describe('SearchBar', () => {
  it('renders the search input', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByTestId('search-input')).toBeTruthy()
  })

  it('uses translated placeholder', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search drugs\u2026')).toBeTruthy()
  })

  it('does not render language buttons (moved to LanguageChips)', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.queryByTestId('lang-en')).toBeNull()
    expect(screen.queryByTestId('lang-prs')).toBeNull()
  })
})
