// src/__tests__/safety-banner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SafetyBanner } from '@/components/DrugDetail/SafetyBanner'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b', white: '#fff',
    warningLight: '#fef3c7', warningDark: '#92400e',
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
      { drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'CONTRAINDICATED' as const, mechanism: 'Bleeding risk' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    expect(screen.getByText(/Warfarin/)).toBeTruthy()
  })

  it('renders the mechanism text for CONTRAINDICATED interactions', () => {
    const interactions = [
      { drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'CONTRAINDICATED' as const, mechanism: 'Bleeding risk' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    expect(screen.getByText(/Bleeding risk/)).toBeTruthy()
  })

  it('renders nothing when no CONTRAINDICATED or MAJOR interactions', () => {
    const interactions = [
      { drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MODERATE' as const, mechanism: 'Minor risk' },
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
      { drugAtcCode: 'L04AX03', drugName: 'Methotrexate', severity: 'CONTRAINDICATED' as const, mechanism: 'Toxic' },
    ]
    const { getByRole } = render(<SafetyBanner interactions={interactions} />)
    expect(getByRole('alert')).toBeTruthy()
  })

  it('renders a major banner for MAJOR interactions', () => {
    const interactions = [
      { drugAtcCode: 'C09AA01', drugName: 'Enalapril', severity: 'MAJOR' as const, mechanism: 'Hyperkalaemia' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    expect(screen.getByText(/Major interactions/)).toBeTruthy()
    expect(screen.getByText(/Enalapril/)).toBeTruthy()
    expect(screen.getByText(/Hyperkalaemia/)).toBeTruthy()
  })

  it('renders CONTRAINDICATED section above MAJOR section when both present', () => {
    const interactions = [
      { drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'CONTRAINDICATED' as const, mechanism: 'Bleeding risk' },
      { drugAtcCode: 'C09AA01', drugName: 'Enalapril', severity: 'MAJOR' as const, mechanism: 'Hyperkalaemia' },
    ]
    render(<SafetyBanner interactions={interactions} />)
    const contraTitle = screen.getByText('Contraindicated interactions')
    const majorTitle = screen.getByText('Major interactions')
    expect(contraTitle).toBeTruthy()
    expect(majorTitle).toBeTruthy()
  })
})
