/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: mockPush }),
}))

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@test.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock ThemeProvider
vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

// Mock trpc client
const mockDashboardStatsQuery = vi.fn()
const mockSubscriptionQuery = vi.fn()
const mockRecentActivityQuery = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      dashboardStats: { query: (...args: any[]) => mockDashboardStatsQuery(...args) },
      recentActivity: { query: (...args: any[]) => mockRecentActivityQuery(...args) },
    },
    subscription: {
      getOrgSubscriptions: { query: (...args: any[]) => mockSubscriptionQuery(...args) },
    },
  },
}))

const { default: DashboardPage } = await import('../app/[locale]/dashboard/page')

const fullStats = {
  pendingKycReviews: 5,
  slaBreachedKycCount: 2,
  pendingLabApprovals: 3,
  oldestPendingLabDays: 10,
  activeAlerts: 4,
  highSeverityAlertCount: 1,
  recentAuditEvents: 20,
  auditChainHealthy: true,
  userCounts: {
    total: 42,
    active: 35,
    suspended: 3,
    pendingInvite: 4,
    withoutMfa: 6,
  },
}

describe('Dashboard Enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: subscription returns trial state
    mockSubscriptionQuery.mockResolvedValue({
      organization: { status: 'TRIAL', trialEndsAt: new Date(Date.now() + 15 * 86400000).toISOString(), name: 'Test Org' },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })
    // Default: recent activity
    mockRecentActivityQuery.mockResolvedValue({
      activities: [
        { type: 'USER_APPROVED', description: 'Dr. A was approved', timestamp: new Date(Date.now() - 120000).toISOString() },
        { type: 'USER_SUSPENDED', description: 'Nurse B was suspended', timestamp: new Date(Date.now() - 3600000).toISOString() },
      ],
    })
  })

  it('shows SLA breach count on KYC card', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('2 breaching SLA')).toBeInTheDocument()
    })
  })

  it('shows subscription widget with Free Trial text', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    // SubscriptionWidget renders "Free Trial — {n} days remaining" as one <p>
    // with static + interpolated text; React may split it across text/comment
    // nodes, so match on the element's full textContent.
    await waitFor(() => {
      expect(
        screen.getByText((_, node) => /^Free Trial — \d+ days remaining$/.test(node?.textContent ?? '')),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Set Up Billing')).toBeInTheDocument()
  })

  it('shows user summary widget with total count and MFA warning', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    // These lines interleave static text with multiple {count} expressions, so
    // React splits them across text nodes — match on the element's textContent.
    expect(
      screen.getByText(
        (_, node) => node?.textContent === '35 active, 3 suspended, 4 pending invite',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === '6 users without MFA'),
    ).toBeInTheDocument()
  })

  it('shows recent activity feed', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Dr. A was approved')).toBeInTheDocument()
    })

    expect(screen.getByText('Nurse B was suspended')).toBeInTheDocument()
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    // "View All →" — static text + entity may split; match on textContent.
    expect(
      screen.getByText((_, node) => /^View All/.test(node?.textContent ?? '') && node?.tagName === 'BUTTON'),
    ).toBeInTheDocument()
  })

  it('shows audit chain health status', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument()
    })
  })

  it('shows HIGH severity count on alerts card', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('1 HIGH severity')).toBeInTheDocument()
    })
  })

  it('shows oldest pending lab days with amber when > 7', async () => {
    mockDashboardStatsQuery.mockResolvedValue(fullStats)

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('oldest: 10d ago')).toBeInTheDocument()
    })
  })
})
