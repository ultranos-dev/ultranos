/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock the trpc client
const mockOrgQuery = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getOrgSubscriptions: { query: (...args: any[]) => mockOrgQuery(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

// Dynamic import after mocks
const { DunningBanner } = await import('../components/subscriptions/DunningBanner')

describe('DunningBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "payment failed" message when paymentFailureReason is set', async () => {
    mockOrgQuery.mockResolvedValue({
      organization: {
        status: 'ACTIVE',
        paymentFailureReason: 'card_declined',
        gracePeriodEndsAt: null,
        name: 'Test Org',
        trialEndsAt: null,
      },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })

    render(<DunningBanner />)

    await waitFor(() => {
      expect(
        screen.getByText(/your last payment failed/i),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /update payment method/i })).toHaveAttribute(
      'href',
      '/subscriptions/billing',
    )
  })

  it('renders grace period countdown when gracePeriodEndsAt is in the future', async () => {
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString() // 5 days from now
    mockOrgQuery.mockResolvedValue({
      organization: {
        status: 'ACTIVE',
        paymentFailureReason: 'card_declined',
        gracePeriodEndsAt: futureDate,
        name: 'Test Org',
        trialEndsAt: null,
      },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })

    render(<DunningBanner />)

    await waitFor(() => {
      expect(screen.getByText(/5 day\(s\) to update/i)).toBeInTheDocument()
    })
  })

  it('renders suspended message when status is SUSPENDED with payment failure', async () => {
    mockOrgQuery.mockResolvedValue({
      organization: {
        status: 'SUSPENDED',
        paymentFailureReason: 'card_declined',
        gracePeriodEndsAt: null,
        name: 'Test Org',
        trialEndsAt: null,
      },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })

    render(<DunningBanner />)

    await waitFor(() => {
      expect(
        screen.getByText(/suspended due to a failed payment/i),
      ).toBeInTheDocument()
    })
  })

  it('renders nothing when no payment failure', async () => {
    mockOrgQuery.mockResolvedValue({
      organization: {
        status: 'ACTIVE',
        paymentFailureReason: null,
        gracePeriodEndsAt: null,
        name: 'Test Org',
        trialEndsAt: null,
      },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })

    const { container } = render(<DunningBanner />)

    // Wait for the async call to resolve
    await waitFor(() => {
      expect(mockOrgQuery).toHaveBeenCalled()
    })

    // Should render nothing
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the query fails', async () => {
    mockOrgQuery.mockRejectedValue(new Error('Network error'))

    const { container } = render(<DunningBanner />)

    await waitFor(() => {
      expect(mockOrgQuery).toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe('')
  })
})
