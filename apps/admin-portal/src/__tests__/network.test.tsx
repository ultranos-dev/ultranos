/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock supabase ────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// ── Mock auth session store ──────────────────────────────────
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// ── Mock next/navigation ────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/network',
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockGetNetworkOverview = vi.fn()
const mockListOutbreaks = vi.fn()
const mockActivateOutbreakMode = vi.fn()
const mockDeactivateOutbreakMode = vi.fn()
const mockEnrollChw = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getNetworkOverview: { query: (...args: any[]) => mockGetNetworkOverview(...args) },
      listOutbreaks: { query: (...args: any[]) => mockListOutbreaks(...args) },
      activateOutbreakMode: { mutate: (...args: any[]) => mockActivateOutbreakMode(...args) },
      deactivateOutbreakMode: { mutate: (...args: any[]) => mockDeactivateOutbreakMode(...args) },
      enrollChw: { mutate: (...args: any[]) => mockEnrollChw(...args) },
    },
  },
}))

const MOCK_LABS = [
  {
    labId: 'lab-1',
    labName: 'Central Lab',
    status: 'ACTIVE',
    pendingSamples: 12,
    stockAlertCount: 3,
    stockDataAvailable: true,
    staffCount: 5,
    lastSyncAt: '2026-05-30T10:00:00Z',
  },
  {
    labId: 'lab-2',
    labName: 'Field Lab',
    status: 'PENDING',
    pendingSamples: 0,
    stockAlertCount: 0,
    stockDataAvailable: false,
    staffCount: 2,
    lastSyncAt: null,
  },
  {
    labId: 'lab-3',
    labName: 'Suspended Lab',
    status: 'SUSPENDED',
    pendingSamples: 0,
    stockAlertCount: 0,
    stockDataAvailable: true,
    staffCount: 0,
    lastSyncAt: '2026-05-01T00:00:00Z',
  },
]

const MOCK_OUTBREAKS = [
  {
    id: 'ob-1',
    pathogen: 'Cholera',
    affectedLabIds: ['lab-1', 'lab-2'],
    affectedLabNames: ['Central Lab', 'Field Lab'],
    status: 'ACTIVE',
    activatedBy: 'admin-1',
    activatedAt: '2026-05-29T08:00:00Z',
    resolvedAt: null,
    resolvedBy: null,
    notes: 'Urgent response needed',
  },
]

const { default: NetworkPage } = await import('../app/[locale]/network/page')

describe('Story 55.7: Network Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetNetworkOverview.mockResolvedValue({ labs: MOCK_LABS })
    mockListOutbreaks.mockResolvedValue({ outbreaks: MOCK_OUTBREAKS })
  })

  // ================================================================
  // Task 10.6: Lab list with correct status badges and metrics
  // ================================================================
  describe('lab list rendering', () => {
    it('renders lab cards with names and status badges', async () => {
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('Central Lab')).toBeDefined()
        expect(screen.getByText('Field Lab')).toBeDefined()
        expect(screen.getByText('Suspended Lab')).toBeDefined()
      })

      // Status badges
      expect(screen.getByText('ACTIVE')).toBeDefined()
      expect(screen.getByText('PENDING')).toBeDefined()
      expect(screen.getByText('SUSPENDED')).toBeDefined()
    })

    it('displays pending samples and staff count metrics', async () => {
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('12')).toBeDefined() // pending samples for Central Lab
        expect(screen.getByText('5')).toBeDefined()  // staff count for Central Lab
      })
    })

    it('shows filter tabs for ALL, ACTIVE, PENDING, SUSPENDED', async () => {
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('All')).toBeDefined()
        expect(screen.getByText('Active')).toBeDefined()
        expect(screen.getByText('Pending')).toBeDefined()
        expect(screen.getByText('Suspended')).toBeDefined()
      })
    })

    it('filters labs by status when filter tab is clicked', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('Central Lab')).toBeDefined()
      })

      // Click Active filter
      await user.click(screen.getByText('Active'))

      // Should show only ACTIVE lab
      expect(screen.getByText('Central Lab')).toBeDefined()
      expect(screen.queryByText('Field Lab')).toBeNull()
      expect(screen.queryByText('Suspended Lab')).toBeNull()
    })
  })

  // ================================================================
  // Task 10.7: Outbreak activation modal
  // ================================================================
  describe('outbreak activation modal', () => {
    it('opens modal when "Activate Outbreak Mode" is clicked', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('Activate Outbreak Mode')).toBeDefined()
      })

      await user.click(screen.getByText('Activate Outbreak Mode'))

      await waitFor(() => {
        expect(screen.getByText('Target Pathogen')).toBeDefined()
        expect(screen.getByText('Affected Labs')).toBeDefined()
      })
    })

    it('shows lab checkboxes in the modal with status', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => screen.getByText('Central Lab'))
      await user.click(screen.getByText('Activate Outbreak Mode'))

      await waitFor(() => {
        // Lab names should appear as checkbox labels in modal
        const checkboxes = screen.getAllByRole('checkbox')
        expect(checkboxes.length).toBeGreaterThanOrEqual(3) // 3 labs
      })
    })

    it('shows confirmation step before activation', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => screen.getByText('Central Lab'))
      await user.click(screen.getByText('Activate Outbreak Mode'))

      // Fill form
      const pathogenInput = screen.getByPlaceholderText('e.g. Cholera, Measles, COVID-19')
      await user.type(pathogenInput, 'Cholera')

      // Select a lab checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0]!)

      // Click Review
      await user.click(screen.getByText('Review'))

      await waitFor(() => {
        expect(screen.getByText(/You are about to activate outbreak mode/)).toBeDefined()
      })
    })
  })

  // ================================================================
  // Task 10.8: CHW enrollment form validation
  // ================================================================
  describe('CHW enrollment modal', () => {
    it('opens CHW enrollment modal when "Enroll CHW" is clicked', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => screen.getByText('Enroll CHW'))
      await user.click(screen.getByText('Enroll CHW'))

      await waitFor(() => {
        expect(screen.getByText('Enroll Community Health Worker')).toBeDefined()
        expect(screen.getByLabelText(/Given Name/)).toBeDefined()
        expect(screen.getByLabelText(/Phone Number/)).toBeDefined()
        expect(screen.getByLabelText(/Assigned Collection Point/)).toBeDefined()
      })
    })

    it('validates that name and phone are required', async () => {
      const user = userEvent.setup()
      render(<NetworkPage />)

      await waitFor(() => screen.getByText('Enroll CHW'))
      // Click the first "Enroll CHW" button (page action button)
      const actionButtons = screen.getAllByText('Enroll CHW')
      await user.click(actionButtons[0]!)

      await waitFor(() => {
        // After modal opens, there are now two "Enroll CHW" texts — page button + modal submit
        const allEnrollButtons = screen.getAllByText('Enroll CHW')
        const modalSubmit = allEnrollButtons[allEnrollButtons.length - 1]
        // Should be disabled when form is empty
        expect((modalSubmit as HTMLButtonElement).disabled).toBe(true)
      })
    })
  })

  // ================================================================
  // Outbreak dashboard
  // ================================================================
  describe('outbreak dashboard', () => {
    it('renders active outbreaks with pathogen and lab count', async () => {
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('Cholera')).toBeDefined()
        expect(screen.getByText(/2 labs affected/)).toBeDefined()
      })
    })

    it('shows Resolve button for active outbreaks', async () => {
      render(<NetworkPage />)

      await waitFor(() => {
        expect(screen.getByText('Resolve')).toBeDefined()
      })
    })
  })
})
