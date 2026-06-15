import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TripRecommendation } from '../components/orders/TripRecommendation'
import type { TripAnalysis } from '../lib/trip-optimizer'
import type { TestTatProfile } from '../lib/test-tat-database'

// Mock next-intl
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

const extendedRemoteProfile: TestTatProfile = {
  loincCode: '99-ext',
  loincDisplay: 'Extended Remote',
  tatCategory: 'extended',
  estimatedMinutes: 0,
  estimatedDays: 3,
  canWait: false,
  remoteDelivery: true,
}

const extendedReturnProfile: TestTatProfile = {
  loincCode: '99-culture',
  loincDisplay: 'Culture',
  tatCategory: 'extended',
  estimatedMinutes: 0,
  estimatedDays: 5,
  canWait: false,
  remoteDelivery: false,
}

const makeAnalysis = (partial: Partial<TripAnalysis>): TripAnalysis => ({
  waitTests: [],
  remoteTests: [],
  returnTests: [],
  estimatedWaitMinutes: 0,
  optimalReturnDate: null,
  recommendation: 'wait',
  ...partial,
})

describe('TripRecommendation', () => {
  it('renders nothing (null) for empty analysis with no tests', () => {
    const { container } = render(
      <TripRecommendation analysis={makeAnalysis({})} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders wait section for recommendation: wait', () => {
    const analysis = makeAnalysis({
      waitTests: [rapidProfile],
      estimatedWaitMinutes: 20,
      recommendation: 'wait',
    })
    render(<TripRecommendation analysis={analysis} />)
    expect(screen.getByTestId('trip-wait-section')).toBeInTheDocument()
    expect(screen.queryByTestId('trip-return-section')).not.toBeInTheDocument()
  })

  it('renders no-return section for recommendation: no-return', () => {
    const analysis = makeAnalysis({
      remoteTests: [extendedRemoteProfile],
      recommendation: 'no-return',
    })
    render(<TripRecommendation analysis={analysis} />)
    expect(screen.getByTestId('trip-no-return-section')).toBeInTheDocument()
    expect(screen.queryByTestId('trip-wait-section')).not.toBeInTheDocument()
  })

  it('renders return section with date for recommendation: return-only', () => {
    const analysis = makeAnalysis({
      returnTests: [extendedReturnProfile],
      recommendation: 'return-only',
      optimalReturnDate: '2026-06-06',
    })
    render(<TripRecommendation analysis={analysis} />)
    const returnSection = screen.getByTestId('trip-return-section')
    expect(returnSection).toBeInTheDocument()
    expect(returnSection.textContent).toContain('2026-06-06')
  })

  it('renders both wait and return sections for recommendation: wait-and-return', () => {
    const analysis = makeAnalysis({
      waitTests: [rapidProfile],
      returnTests: [extendedReturnProfile],
      estimatedWaitMinutes: 20,
      recommendation: 'wait-and-return',
      optimalReturnDate: '2026-06-06',
    })
    render(<TripRecommendation analysis={analysis} />)
    expect(screen.getByTestId('trip-wait-section')).toBeInTheDocument()
    expect(screen.getByTestId('trip-return-section')).toBeInTheDocument()
  })

  it('renders Print Summary button', () => {
    const analysis = makeAnalysis({
      waitTests: [rapidProfile],
      estimatedWaitMinutes: 20,
      recommendation: 'wait',
    })
    render(<TripRecommendation analysis={analysis} />)
    expect(screen.getByTestId('trip-print-button')).toBeInTheDocument()
  })

  it('renders WaitTimeIndicator for each wait test', () => {
    const cbc: TestTatProfile = {
      loincCode: '58410-2',
      loincDisplay: 'CBC',
      tatCategory: 'same-day',
      estimatedMinutes: 45,
      canWait: true,
      remoteDelivery: false,
    }
    const analysis = makeAnalysis({
      waitTests: [rapidProfile, cbc],
      estimatedWaitMinutes: 45,
      recommendation: 'wait',
    })
    render(<TripRecommendation analysis={analysis} />)
    expect(screen.getAllByTestId('wait-time-indicator')).toHaveLength(2)
  })
})
