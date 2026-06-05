/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: mockPush }),
}))

// Mock trpc client
const mockQuery = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      dashboardStats: { query: (...args: any[]) => mockQuery(...args) },
    },
  },
}))

const { default: DashboardPage } = await import('../app/dashboard/page')

describe('Dashboard Page', () => {
  it('renders 4 stat cards with placeholder values before data loads', () => {
    mockQuery.mockReturnValue(new Promise(() => {})) // Never resolves
    render(<DashboardPage />)

    expect(screen.getByText('Pending KYC Reviews')).toBeTruthy()
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
      pendingLabApprovals: 5,
      activeAlerts: 1,
      recentAuditEvents: 10,
    })

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy()
    })

    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
  })

  it('renders the Dashboard heading', () => {
    mockQuery.mockReturnValue(new Promise(() => {}))
    render(<DashboardPage />)
    expect(screen.getByText('Dashboard')).toBeTruthy()
  })
})
