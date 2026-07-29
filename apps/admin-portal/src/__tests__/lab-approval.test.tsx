/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock next/navigation ────────────────────────────────────
const mockPush = vi.fn()
const mockParams = { labId: 'lab-1' }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/labs',
  useParams: () => mockParams,
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockQuery = vi.fn()
const mockMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listLabs: { query: (...args: any[]) => mockQuery('listLabs', ...args) },
      getLabDetail: { query: (...args: any[]) => mockQuery('getLabDetail', ...args) },
      reviewLab: { mutate: (...args: any[]) => mockMutate('reviewLab', ...args) },
      dashboardStats: { query: (...args: any[]) => mockQuery('dashboardStats', ...args) },
      // The dashboard also renders RecentActivityFeed; stub so it doesn't throw.
      recentActivity: { query: () => Promise.resolve({ activities: [] }) },
    },
    // DunningBanner + SubscriptionWidget on the dashboard use this.
    subscription: {
      getOrgSubscriptions: {
        query: () => Promise.resolve({ organization: { status: 'ACTIVE' }, subscriptions: [], totalMonthlyCostUsd: 0 }),
      },
    },
  },
}))

const { default: LabsPage } = await import('../app/[locale]/labs/page')
const { default: LabDetailPage } = await import('../app/[locale]/labs/[labId]/page')
const { default: DashboardPage } = await import('../app/[locale]/dashboard/page')

const mockLabList = {
  labs: [
    {
      id: 'lab-1',
      labName: 'Alpha Lab',
      licenseReference: 'LIC-001',
      accreditationReference: 'ACC-001',
      technicianName: 'Ali Khan',
      registeredAt: '2026-05-01T00:00:00Z',
      status: 'PENDING',
    },
    {
      id: 'lab-2',
      labName: 'Beta Lab',
      licenseReference: 'LIC-002',
      accreditationReference: null,
      technicianName: 'Sara Lee',
      registeredAt: '2026-05-02T00:00:00Z',
      status: 'ACTIVE',
    },
  ],
  total: 2,
  cursor: 0,
  limit: 25,
}

const mockLabDetail = {
  id: 'lab-1',
  labName: 'Alpha Lab',
  licenseReference: 'LIC-001',
  accreditationReference: 'ACC-001',
  status: 'PENDING',
  registeredAt: '2026-05-01T00:00:00Z',
  technician: {
    id: 'tech-1',
    name: 'Ali Khan',
    email: 'ali@lab.com',
    credentialRef: 'CRED-001',
    qualification: 'Lab Technician',
  },
  statusHistory: [
    {
      status: 'PENDING',
      changedBy: 'tech-1',
      changedAt: '2026-05-01T00:00:00Z',
      reason: 'Initial registration',
    },
  ],
  uploadCount: 0,
}

describe('Story 22.3 — Lab Queue & Detail UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Lab Queue Page ─────────────────────────────────────────
  describe('LabsPage', () => {
    it('renders table with correct columns and status badges', async () => {
      mockQuery.mockImplementation((method: string) => {
        if (method === 'listLabs') return Promise.resolve(mockLabList)
        return Promise.resolve({})
      })

      render(<LabsPage />)

      await waitFor(() => {
        expect(screen.getByText('Alpha Lab')).toBeInTheDocument()
      })

      // Column headers
      expect(screen.getByText('Lab Name')).toBeInTheDocument()
      expect(screen.getByText('License Ref')).toBeInTheDocument()
      expect(screen.getByText('Accreditation')).toBeInTheDocument()
      expect(screen.getByText('Technician')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()

      // Status badges
      expect(screen.getByText('PENDING')).toBeInTheDocument()
      expect(screen.getByText('ACTIVE')).toBeInTheDocument()

      // Data
      expect(screen.getByText('LIC-001')).toBeInTheDocument()
      expect(screen.getByText('Ali Khan')).toBeInTheDocument()
      expect(screen.getByText('Beta Lab')).toBeInTheDocument()
    })

    it('renders filter tabs for All, Pending, Active, Suspended', async () => {
      mockQuery.mockResolvedValue(mockLabList)

      render(<LabsPage />)

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument()
      })

      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Suspended')).toBeInTheDocument()
    })

    it('navigates to detail page on row click', async () => {
      mockQuery.mockResolvedValue(mockLabList)

      const user = userEvent.setup()
      render(<LabsPage />)

      await waitFor(() => {
        expect(screen.getByText('Alpha Lab')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Alpha Lab'))
      expect(mockPush).toHaveBeenCalledWith('/labs/lab-1')
    })
  })

  // ── Lab Detail Page ─────────────────────────────────────────
  describe('LabDetailPage', () => {
    it('shows lab details, technician info, and status history', async () => {
      mockQuery.mockImplementation((method: string) => {
        if (method === 'getLabDetail') return Promise.resolve(mockLabDetail)
        return Promise.resolve({})
      })

      render(<LabDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Alpha Lab')).toBeInTheDocument()
      })

      // Registration details
      expect(screen.getByText('LIC-001')).toBeInTheDocument()
      expect(screen.getByText('ACC-001')).toBeInTheDocument()

      // Technician credentials
      expect(screen.getByText('Ali Khan')).toBeInTheDocument()
      expect(screen.getByText('ali@lab.com')).toBeInTheDocument()
      expect(screen.getByText('CRED-001')).toBeInTheDocument()

      // Status history
      expect(screen.getByText('Initial registration')).toBeInTheDocument()
    })

    it('shows Approve button for PENDING lab', async () => {
      mockQuery.mockResolvedValue(mockLabDetail)

      render(<LabDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument()
      })

      // Should NOT show Suspend or Reactivate
      expect(screen.queryByText('Suspend')).not.toBeInTheDocument()
      expect(screen.queryByText('Reactivate')).not.toBeInTheDocument()
    })

    it('shows confirmation dialog before status transition', async () => {
      mockQuery.mockResolvedValue(mockLabDetail)

      const user = userEvent.setup()
      render(<LabDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Approve'))

      // Confirmation dialog appears — AC #8
      expect(screen.getByText('Approve Lab')).toBeInTheDocument()
      expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
    })

    it('shows Suspend button for ACTIVE lab', async () => {
      const activeLab = { ...mockLabDetail, status: 'ACTIVE' }
      mockQuery.mockResolvedValue(activeLab)

      render(<LabDetailPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
      })
    })

    it('shows Reactivate button for SUSPENDED lab', async () => {
      const suspendedLab = { ...mockLabDetail, status: 'SUSPENDED' }
      mockQuery.mockResolvedValue(suspendedLab)

      render(<LabDetailPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
      })
    })
  })

  // ── Dashboard ─────────────────────────────────────────────
  describe('DashboardPage', () => {
    it('displays live pending lab approvals count', async () => {
      mockQuery.mockResolvedValue({
        pendingKycReviews: 0,
        pendingLabApprovals: 5,
        activeAlerts: 0,
        recentAuditEvents: 0,
      })

      render(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument()
      })

      expect(screen.getByText('Pending Lab Approvals')).toBeInTheDocument()
    })
  })
})
