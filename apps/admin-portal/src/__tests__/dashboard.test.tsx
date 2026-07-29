/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: mockPush }),
}))

// Mock trpc client. The dashboard also renders DunningBanner + SubscriptionWidget
// (subscription.getOrgSubscriptions) and RecentActivityFeed (admin.recentActivity);
// stub those so those widgets don't throw and crash the page render.
const mockQuery = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      dashboardStats: { query: (...args: any[]) => mockQuery(...args) },
      recentActivity: { query: () => Promise.resolve({ activities: [] }) },
    },
    subscription: {
      getOrgSubscriptions: {
        query: () => Promise.resolve({ organization: { status: 'ACTIVE' }, subscriptions: [], totalMonthlyCostUsd: 0 }),
      },
    },
  },
}))

const { default: DashboardPage } = await import('../app/[locale]/dashboard/page')

describe('Dashboard Page', () => {
  it('renders 4 stat cards with placeholder values before data loads', () => {
    mockQuery.mockReturnValue(new Promise(() => {})) // Never resolves
    render(<DashboardPage />)

    expect(screen.getByText('Users')).toBeTruthy()
    expect(screen.getByText('Pending Lab Approvals')).toBeTruthy()
    expect(screen.getByText('Active Alerts')).toBeTruthy()
    expect(screen.getByText('Recent Audit Events')).toBeTruthy()

    // All 4 cards should show the "—" placeholder
    const dashes = screen.getAllByText('\u2014')
    expect(dashes.length).toBe(4)
  })

  it('shows live data when stats load', async () => {
    mockQuery.mockResolvedValue({
      pendingKycReviews: 2,
      userCounts: { total: 7, active: 5, suspended: 1, pendingInvite: 1, withoutMfa: 0 },
      pendingLabApprovals: 5,
      activeAlerts: 1,
      recentAuditEvents: 10,
    })

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy()
    })

    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
  })

  it('renders the Dashboard heading', () => {
    mockQuery.mockReturnValue(new Promise(() => {}))
    render(<DashboardPage />)
    // Page renders <h1>{t('dashboard.pageTitle')}</h1> → "Dashboard".
    // Use role query to avoid ambiguity if other "Dashboard" text is added.
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })
})
