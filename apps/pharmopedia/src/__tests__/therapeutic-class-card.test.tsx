import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { TherapeuticClassCard } from '@/components/TherapeuticClassCard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111',
    textSecondary: '#666',
    textMuted: '#999',
    surface: '#fff',
    surfaceSubtle: '#f5f5f5',
    border: '#e5e5e5',
    borderSubtle: '#f0f0f0',
    primary50: '#ecfdf5',
    primary500: '#2e9e71',
    primary600: '#1d8a5e',
    danger: '#dc2626',
    white: '#fff',
  }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ lang: 'en' }),
  isRtlLang: () => false,
}))

describe('TherapeuticClassCard', () => {
  it('renders the count', () => {
    const { getByText } = render(
      <TherapeuticClassCard name="Cardiovascular" count={12} onPress={vi.fn()} />,
    )
    expect(getByText('12')).toBeTruthy()
  })

  it('exposes an accessibilityLabel containing the name and count', () => {
    const { getByRole } = render(
      <TherapeuticClassCard name="Cardiovascular" count={12} onPress={vi.fn()} />,
    )
    const btn = getByRole('button')
    expect(btn.props.accessibilityLabel).toContain('Cardiovascular')
    expect(btn.props.accessibilityLabel).toContain('12')
  })

  it('calls onPress when pressed', () => {
    const onPress = vi.fn()
    const { getByTestId } = render(
      <TherapeuticClassCard name="Cardiovascular" count={12} onPress={onPress} />,
    )
    fireEvent.press(getByTestId('class-card-Cardiovascular'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
