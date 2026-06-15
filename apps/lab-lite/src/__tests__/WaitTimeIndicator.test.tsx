import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WaitTimeIndicator } from '../components/orders/WaitTimeIndicator'
import type { TestTatProfile } from '../lib/test-tat-database'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

const rapidProfile: TestTatProfile = {
  loincCode: '24356-8',
  loincDisplay: 'Urinalysis',
  tatCategory: 'rapid',
  estimatedMinutes: 20,
  canWait: true,
  remoteDelivery: false,
}

const sameDayProfile: TestTatProfile = {
  loincCode: '58410-2',
  loincDisplay: 'Blood Work — CBC',
  tatCategory: 'same-day',
  estimatedMinutes: 45,
  canWait: true,
  remoteDelivery: false,
}

describe('WaitTimeIndicator', () => {
  it('renders with test-id wait-time-indicator', () => {
    render(<WaitTimeIndicator profile={rapidProfile} />)
    expect(screen.getByTestId('wait-time-indicator')).toBeInTheDocument()
  })

  it('shows test display name', () => {
    render(<WaitTimeIndicator profile={rapidProfile} />)
    expect(screen.getByText('Urinalysis')).toBeInTheDocument()
  })

  it('shows estimated minutes', () => {
    render(<WaitTimeIndicator profile={rapidProfile} />)
    expect(screen.getByTestId('wait-time-minutes')).toBeInTheDocument()
  })

  it('shows correct minutes for same-day test', () => {
    render(<WaitTimeIndicator profile={sameDayProfile} />)
    const minutesEl = screen.getByTestId('wait-time-minutes')
    expect(minutesEl.textContent).toContain('45')
  })

  it('shows waiting status icon by default', () => {
    render(<WaitTimeIndicator profile={rapidProfile} />)
    expect(screen.getByTestId('wait-status-icon')).toBeInTheDocument()
  })

  it('renders without crashing for any tatCategory', () => {
    const extended: TestTatProfile = {
      loincCode: '99-ext',
      loincDisplay: 'Extended',
      tatCategory: 'extended',
      estimatedMinutes: 0,
      estimatedDays: 3,
      canWait: false,
      remoteDelivery: true,
    }
    expect(() => render(<WaitTimeIndicator profile={extended} />)).not.toThrow()
  })
})
