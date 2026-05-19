import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock trpc client
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getOrgThresholds: {
        query: vi.fn().mockResolvedValue({
          kycReviewSlaDays: 7,
          controlledSubstanceDailyLimit: 10,
          drugFrequencyThresholdPct: 20,
          licenseExpiryWarningDays: [60, 30, 7],
        }),
      },
      updateOrgThresholds: { mutate: vi.fn() },
    },
  },
  reportAdminAuthEvent: vi.fn(),
}))

const { ThresholdSettings } = await import('../components/settings/ThresholdSettings')

describe('ThresholdSettings', () => {
  it('renders threshold inputs with labels', async () => {
    render(<ThresholdSettings />)

    await waitFor(() => {
      expect(screen.getByText('KYC Review SLA (days)')).toBeTruthy()
    })

    expect(screen.getByText('Controlled Substance Daily Limit')).toBeTruthy()
    expect(screen.getByText('Drug Frequency Threshold (%)')).toBeTruthy()
    expect(screen.getByText('License Expiry Warning Bands')).toBeTruthy()
    expect(screen.getByText('Yellow (days)')).toBeTruthy()
    expect(screen.getByText('Orange (days)')).toBeTruthy()
    expect(screen.getByText('Red (days)')).toBeTruthy()
    expect(screen.getByText('Save Thresholds')).toBeTruthy()
  })

  it('renders helper text for each threshold', async () => {
    render(<ThresholdSettings />)

    await waitFor(() => {
      expect(screen.getByText('Days before a pending KYC submission is flagged as SLA-breached')).toBeTruthy()
    })

    expect(screen.getByText('Prescriptions per day per provider before triggering anomaly alert')).toBeTruthy()
    expect(screen.getByText('Percentage of patients receiving same drug in 7 days before alert')).toBeTruthy()
  })
})
