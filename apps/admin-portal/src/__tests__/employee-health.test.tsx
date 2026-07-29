/* eslint-disable @typescript-eslint/no-explicit-any */
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
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ practitionerId: '00000000-0000-0000-0000-000000000001' }),
  usePathname: () => '/staff/00000000-0000-0000-0000-000000000001/health',
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockGetEmployeeHealth = vi.fn()
const mockUpdateEmployeeHealth = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getEmployeeHealth: { query: (...args: any[]) => mockGetEmployeeHealth(...args) },
      updateEmployeeHealth: { mutate: (...args: any[]) => mockUpdateEmployeeHealth(...args) },
    },
  },
}))

const { default: EmployeeHealthPage } = await import('../app/[locale]/staff/[practitionerId]/health/page')

const MOCK_RECORD = {
  id: 'rec-1',
  practitionerId: '00000000-0000-0000-0000-000000000001',
  hepBStatus: 'COMPLETE',
  hepBTiterDate: '2025-06-15',
  tetanusStatus: 'IN_PROGRESS',
  tetanusDate: '2025-03-10',
  covidStatus: 'COMPLETE',
  covidDoses: 3,
  covidLastDoseDate: '2025-01-20',
  tbScreeningDate: '2025-08-01',
  tbScreeningResult: 'NEGATIVE',
  exposureHistory: [
    { date: '2025-02-01', type: 'Needlestick', outcome: 'No seroconversion' },
  ],
  reminders: {
    tbScreening: { status: 'OVERDUE', daysOverdue: 60, message: 'TB screening overdue by 60 days' },
  },
  createdAt: '2025-06-01T00:00:00Z',
  updatedAt: '2025-08-01T00:00:00Z',
}

describe('EmployeeHealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEmployeeHealth.mockResolvedValue(MOCK_RECORD)
    mockUpdateEmployeeHealth.mockResolvedValue({ success: true, id: 'rec-1' })
  })

  it('renders all form sections', async () => {
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('Hepatitis B')).toBeDefined()
    })
    expect(screen.getByText('Tetanus')).toBeDefined()
    expect(screen.getByText('COVID-19')).toBeDefined()
    expect(screen.getByText('TB Screening')).toBeDefined()
    expect(screen.getByText('Exposure History')).toBeDefined()
  })

  it('shows TB screening overdue banner', async () => {
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('TB screening overdue by 60 days')).toBeDefined()
    })
  })

  it('shows TB screening due soon banner', async () => {
    mockGetEmployeeHealth.mockResolvedValue({
      ...MOCK_RECORD,
      reminders: {
        tbScreening: { status: 'DUE_SOON', daysUntilDue: 15, message: 'TB screening due in 15 days' },
      },
    })

    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('TB screening due in 15 days')).toBeDefined()
    })
  })

  it('renders existing exposure history entries', async () => {
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Needlestick')).toBeDefined()
    })
    expect(screen.getByDisplayValue('No seroconversion')).toBeDefined()
  })

  it('can add and remove exposure history entries', async () => {
    const user = userEvent.setup()
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('Exposure History')).toBeDefined()
    })

    // Add an entry
    await user.click(screen.getByText('+ Add Entry'))

    // Should now have 2 Remove buttons (1 existing + 1 new)
    const removeButtons = screen.getAllByText('Remove')
    expect(removeButtons.length).toBe(2)

    // Remove the new entry
    await user.click(removeButtons[1]!)
    await waitFor(() => {
      expect(screen.getAllByText('Remove').length).toBe(1)
    })
  })

  it('calls updateEmployeeHealth on save', async () => {
    const user = userEvent.setup()
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('Save Health Record')).toBeDefined()
    })

    await user.click(screen.getByText('Save Health Record'))

    await waitFor(() => {
      expect(mockUpdateEmployeeHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          practitionerId: '00000000-0000-0000-0000-000000000001',
          hepBStatus: 'COMPLETE',
          tetanusStatus: 'IN_PROGRESS',
          covidStatus: 'COMPLETE',
        }),
      )
    })
  })

  it('shows success toast after save', async () => {
    const user = userEvent.setup()
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText('Save Health Record')).toBeDefined()
    })

    await user.click(screen.getByText('Save Health Record'))

    await waitFor(() => {
      expect(screen.getByText('Health record saved successfully')).toBeDefined()
    })
  })

  it('navigates back to lab assignments on back link click', async () => {
    const user = userEvent.setup()
    render(<EmployeeHealthPage />)

    await waitFor(() => {
      expect(screen.getByText(/Back to Lab Assignments/)).toBeDefined()
    })

    await user.click(screen.getByText(/Back to Lab Assignments/))
    expect(mockPush).toHaveBeenCalledWith('/users?tab=lab-assignments')
  })
})
