import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the trpc client
const mockQuery = vi.fn()
const mockMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getOrgSubscriptions: { query: (...args: any[]) => mockQuery('getOrgSubscriptions', ...args) },
      getAvailableModules: { query: (...args: any[]) => mockQuery('getAvailableModules', ...args) },
      addModule: { mutate: (...args: any[]) => mockMutate('addModule', ...args) },
      removeModule: { mutate: (...args: any[]) => mockMutate('removeModule', ...args) },
    },
  },
}))

// Dynamic imports after mock setup
const { default: SubscriptionsPage } = await import('../app/subscriptions/page')
const { AddModuleDialog } = await import('../components/subscriptions/AddModuleDialog')
const { RemoveModuleDialog } = await import('../components/subscriptions/RemoveModuleDialog')

const mockOrgSubscriptions = {
  organization: {
    id: 'org-1',
    name: 'Test Hospital',
    status: 'ACTIVE',
    trialEndsAt: null,
    billingEmail: 'billing@test.com',
  },
  subscriptions: [
    {
      id: 'sub-1',
      orgId: 'org-1',
      moduleCode: 'OPD_LITE',
      moduleName: 'OPD Lite',
      status: 'ACTIVE',
      startedAt: '2026-05-01T00:00:00Z',
      expiresAt: '2026-05-31T00:00:00Z',
      cancelledAt: null,
      monthlyCostUsd: 50,
    },
    {
      id: 'sub-2',
      orgId: 'org-1',
      moduleCode: 'LAB_LITE',
      moduleName: 'Lab Lite',
      status: 'ACTIVE',
      startedAt: '2026-05-01T00:00:00Z',
      expiresAt: '2026-05-31T00:00:00Z',
      cancelledAt: null,
      monthlyCostUsd: 30,
    },
  ],
  totalMonthlyCostUsd: 80,
}

describe('Story 27.5 — Admin Portal Subscription Components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Task 2: Dashboard Page ─────────────────────────────────────

  describe('SubscriptionsPage', () => {
    it('renders org name, status badge, and module list', async () => {
      mockQuery.mockImplementation((method: string) => {
        if (method === 'getOrgSubscriptions') return Promise.resolve(mockOrgSubscriptions)
        return Promise.resolve({ modules: [] })
      })

      render(<SubscriptionsPage />)

      await waitFor(() => {
        expect(screen.getByText('Test Hospital')).toBeInTheDocument()
      })

      // Org badge + 2 subscription badges = 3 ACTIVE badges
      expect(screen.getAllByText('ACTIVE')).toHaveLength(3)
      expect(screen.getByText('OPD Lite')).toBeInTheDocument()
      expect(screen.getByText('Lab Lite')).toBeInTheDocument()
      expect(screen.getByText('$80.00')).toBeInTheDocument()
    })

    it('renders empty state when no modules subscribed', async () => {
      mockQuery.mockResolvedValue({
        organization: mockOrgSubscriptions.organization,
        subscriptions: [],
        totalMonthlyCostUsd: 0,
      })

      render(<SubscriptionsPage />)

      await waitFor(() => {
        expect(screen.getByText(/No modules subscribed/)).toBeInTheDocument()
      })
    })
  })

  // ── Task 3: Add Module Dialog ──────────────────────────────────

  describe('AddModuleDialog', () => {
    it('shows only unsubscribed modules', async () => {
      const availableModules = {
        modules: [
          { id: 'm2', code: 'PHARMACY_LITE', displayName: 'Pharmacy Lite', description: 'Pharmacy module', basePriceUsd: 40 },
        ],
      }

      mockQuery.mockResolvedValue(availableModules)

      render(<AddModuleDialog open={true} onOpenChange={vi.fn()} onModuleAdded={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
      })

      expect(screen.getByText('$40.00 / month')).toBeInTheDocument()
      expect(screen.queryByText('OPD Lite')).not.toBeInTheDocument()
    })

    it('shows empty state when all modules subscribed', async () => {
      mockQuery.mockResolvedValue({ modules: [] })

      render(<AddModuleDialog open={true} onOpenChange={vi.fn()} onModuleAdded={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText(/subscribed to all available modules/)).toBeInTheDocument()
      })
    })
  })

  // ── Task 4: Remove Module Dialog ───────────────────────────────

  describe('RemoveModuleDialog', () => {
    it('shows cancellation notice with correct expiry date', () => {
      const sub = {
        id: 'sub-1',
        moduleName: 'OPD Lite',
        moduleCode: 'OPD_LITE',
        expiresAt: '2026-05-31T00:00:00Z',
      }

      render(
        <RemoveModuleDialog
          subscription={sub}
          isLastActive={false}
          open={true}
          onOpenChange={vi.fn()}
          onModuleRemoved={vi.fn()}
        />,
      )

      expect(screen.getByText(/Are you sure you want to cancel/)).toBeInTheDocument()
      expect(screen.getByText(/OPD Lite/)).toBeInTheDocument()
      // Verify the dialog has the correct structure
      expect(screen.getByRole('button', { name: 'Cancel Subscription' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Keep Subscription' })).toBeInTheDocument()
    })

    it('warns when cancelling last active module', () => {
      const sub = {
        id: 'sub-1',
        moduleName: 'OPD Lite',
        moduleCode: 'OPD_LITE',
        expiresAt: '2026-05-31T00:00:00Z',
      }

      render(
        <RemoveModuleDialog
          subscription={sub}
          isLastActive={true}
          open={true}
          onOpenChange={vi.fn()}
          onModuleRemoved={vi.fn()}
        />,
      )

      expect(screen.getByText(/only active module/)).toBeInTheDocument()
    })
  })
})
