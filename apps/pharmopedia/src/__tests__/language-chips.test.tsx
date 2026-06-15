import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'

vi.mock('@/lib/haptics', () => ({
  hapticSelection: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary500: '#2e9e71',
    surfaceSubtle: '#f3f4f6',
    border: '#e5e7eb',
    textSecondary: '#6b7280',
  }),
}))

const mockSetLang = vi.fn()
let activeLang = 'en'

vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string; setLang: typeof mockSetLang }) => unknown) =>
    selector({ lang: activeLang, setLang: mockSetLang }),
}))

import { LanguageChips } from '@/components/LanguageChips'

beforeEach(() => {
  vi.clearAllMocks()
  activeLang = 'en'
})

describe('LanguageChips', () => {
  it('renders 4 language chips', () => {
    render(<LanguageChips />)
    expect(screen.getByTestId('lang-chip-en')).toBeTruthy()
    expect(screen.getByTestId('lang-chip-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-chip-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-chip-ar')).toBeTruthy()
  })

  it('highlights the active language', () => {
    activeLang = 'prs'
    render(<LanguageChips />)
    expect(screen.getByTestId('lang-chip-prs')).toBeTruthy()
  })

  it('calls setLang when a chip is pressed', () => {
    render(<LanguageChips />)
    const chip = screen.getByTestId('lang-chip-ar')
    fireEvent.press(chip)
    expect(mockSetLang).toHaveBeenCalledWith('ar')
  })
})
