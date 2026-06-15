// src/__tests__/safety-banner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SafetyBanner } from '@/components/DrugDetail/SafetyBanner'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b', white: '#fff',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('lucide-react-native', () => ({
  AlertTriangle: () => null,
}))

describe('SafetyBanner', () => {
  it('renders when there are CONTRAINDICATED interactions', () => {
    const interactions = [
      { drugName: 'Warfarin', severity: 'CONTRAINDICATED' as const, description: 'Bleeding risk' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    expect(screen.getByText(/Warfarin/)).toBeTruthy()
  })

  it('renders nothing when no CONTRAINDICATED interactions', () => {
    const interactions = [
      { drugName: 'Aspirin', severity: 'MODERATE' as const, description: 'Minor risk' },
    ]
    const { toJSON } = render(<SafetyBanner interactions={interactions} />)
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when interactions is empty', () => {
    const { toJSON } = render(<SafetyBanner interactions={[]} />)
    expect(toJSON()).toBeNull()
  })

  it('has accessibilityRole alert', () => {
    const interactions = [
      { drugName: 'Methotrexate', severity: 'CONTRAINDICATED' as const, description: 'Toxic' },
    ]
    const { getByRole } = render(<SafetyBanner interactions={interactions} />)
    expect(getByRole('alert')).toBeTruthy()
  })
})
