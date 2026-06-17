import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'

vi.mock('@/lib/haptics', () => ({
  hapticSelection: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary500: '#2e9e71',
    surface: '#ffffff',
    surfaceSubtle: '#f3f4f6',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockSetLang = vi.fn()
let activeLang = 'en'

vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string; setLang: typeof mockSetLang }) => unknown) =>
    selector({ lang: activeLang, setLang: mockSetLang }),
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

import { LanguageMenu } from '@/components/LanguageMenu'

beforeEach(() => {
  vi.clearAllMocks()
  activeLang = 'en'
})

describe('LanguageMenu', () => {
  it('renders a globe trigger and keeps the menu closed initially', () => {
    render(<LanguageMenu />)
    expect(screen.getByTestId('lang-menu-trigger')).toBeTruthy()
    expect(screen.queryByTestId('lang-menu-item-en')).toBeNull()
  })

  it('opens the menu with all four languages when the trigger is pressed', () => {
    render(<LanguageMenu />)
    fireEvent.press(screen.getByTestId('lang-menu-trigger'))
    expect(screen.getByTestId('lang-menu-item-en')).toBeTruthy()
    expect(screen.getByTestId('lang-menu-item-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-menu-item-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-menu-item-ar')).toBeTruthy()
  })

  it('calls setLang with the chosen language when an item is pressed', () => {
    render(<LanguageMenu />)
    fireEvent.press(screen.getByTestId('lang-menu-trigger'))
    fireEvent.press(screen.getByTestId('lang-menu-item-ar'))
    expect(mockSetLang).toHaveBeenCalledWith('ar')
  })

  it('marks the active language as selected', () => {
    activeLang = 'prs'
    render(<LanguageMenu />)
    fireEvent.press(screen.getByTestId('lang-menu-trigger'))
    expect(screen.getByTestId('lang-menu-item-prs').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId('lang-menu-item-en').props.accessibilityState).toEqual({ selected: false })
  })
})
