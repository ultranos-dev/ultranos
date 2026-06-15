// src/__tests__/severity-badge.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SeverityBadge } from '@/components/DrugDetail/SeverityBadge'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b',
    warning: '#d97706', warningLight: '#fef3c7', warningDark: '#92400e',
    neutral200: '#e5e5e5', neutral600: '#525252',
    textSecondary: '#666',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('SeverityBadge', () => {
  it('renders CONTRAINDICATED with danger styling', () => {
    const { getByText } = render(<SeverityBadge severity="CONTRAINDICATED" />)
    expect(getByText('drug.clinical.severity.CONTRAINDICATED')).toBeTruthy()
  })

  it('renders MAJOR with warning styling', () => {
    const { getByText } = render(<SeverityBadge severity="MAJOR" />)
    expect(getByText('drug.clinical.severity.MAJOR')).toBeTruthy()
  })

  it('renders MINOR with neutral styling', () => {
    const { getByText } = render(<SeverityBadge severity="MINOR" />)
    expect(getByText('drug.clinical.severity.MINOR')).toBeTruthy()
  })

  it('has accessibilityLabel', () => {
    const { getByLabelText } = render(<SeverityBadge severity="CONTRAINDICATED" />)
    expect(getByLabelText('drug.clinical.severity.CONTRAINDICATED')).toBeTruthy()
  })
})
