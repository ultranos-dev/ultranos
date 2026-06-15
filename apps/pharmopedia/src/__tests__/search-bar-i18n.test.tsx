import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'

vi.mock('@/store/lang-store', () => {
  const store = { lang: 'en', setLang: vi.fn() }
  return {
    useLangStore: (selector) => selector(store),
    isRtlLang: (lang) => ['prs', 'ps', 'ar'].includes(lang),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => ({
      'search.placeholder': 'Search drugs\u2026',
      'search.lang.en': 'EN',
      'search.lang.prs': 'دری',
      'search.lang.ps': 'پښتو',
      'search.lang.ar': 'عربي',
    }[key] ?? key),
  }),
}))

describe('SearchBar', () => {
  it('renders all four language buttons', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByTestId('lang-en')).toBeTruthy()
    expect(screen.getByTestId('lang-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-ar')).toBeTruthy()
  })

  it('shows Arabic label عربي for ar button', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByText('عربي')).toBeTruthy()
  })

  it('uses translated placeholder', () => {
    render(<SearchBar value="" onSearch={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search drugs\u2026')).toBeTruthy()
  })
})
