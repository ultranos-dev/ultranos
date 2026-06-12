/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/alerts/configuration',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
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
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock trpc client
const mockGetSurveillanceConfig = vi.fn()
const mockUpdateSurveillanceConfig = vi.fn()
const mockListSurveillanceAlerts = vi.fn()
const mockAcknowledgeSurveillanceAlert = vi.fn()
const mockListLabs = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getSurveillanceConfig: { query: (...args: any[]) => mockGetSurveillanceConfig(...args) },
      updateSurveillanceConfig: { mutate: (...args: any[]) => mockUpdateSurveillanceConfig(...args) },
      listSurveillanceAlerts: { query: (...args: any[]) => mockListSurveillanceAlerts(...args) },
      acknowledgeSurveillanceAlert: { mutate: (...args: any[]) => mockAcknowledgeSurveillanceAlert(...args) },
      listLabs: { query: (...args: any[]) => mockListLabs(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { SurveillanceConfigForm } = await import('../components/alerts/SurveillanceConfigForm')
const { SurveillanceAlertHistory } = await import('../components/alerts/SurveillanceAlertHistory')
const { AcknowledgeAlertModal } = await import('../components/alerts/AcknowledgeAlertModal')

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Config Form Tests ───

describe('SurveillanceConfigForm', () => {
  const defaultLabs = {
    labs: [
      { id: 'lab-1', labName: 'Central Lab', status: 'ACTIVE' },
      { id: 'lab-2', labName: 'District Lab', status: 'ACTIVE' },
      { id: 'lab-3', labName: 'Mobile Unit', status: 'SUSPENDED' },
    ],
    total: 3,
  }

  it('renders lab checkbox list with status badges', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Central Lab')).toBeTruthy()
      expect(screen.getByText('District Lab')).toBeTruthy()
      expect(screen.getByText('Mobile Unit')).toBeTruthy()
    })

    // Status badges
    const activeBadges = screen.getAllByText('ACTIVE')
    expect(activeBadges).toHaveLength(2)
    expect(screen.getByText('SUSPENDED')).toBeTruthy()
  })

  it('pre-populates default thresholds when no config exists', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      // Default thresholds should be populated
      const inputs = screen.getAllByRole('spinbutton')
      // Find the threshold value inputs — they should have 15, 5, 3
      const values = inputs.map((i) => (i as HTMLInputElement).value)
      expect(values).toContain('15')
      expect(values).toContain('5')
      expect(values).toContain('3')
    })
  })

  it('loads existing config and pre-fills form', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({
      config: {
        id: 'cfg-1',
        monitoredLabIds: ['lab-1'],
        monitoredLabs: [{ id: 'lab-1', name: 'Central Lab', status: 'ACTIVE' }],
        thresholds: [{ test_category: 'Custom Test', threshold_pct: 20 }],
        channels: { in_app: true, email: 'officer@test.com' },
      },
    })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      // Lab-1 should be checked
      const checkboxes = screen.getAllByRole('checkbox')
      const centralLabCheckbox = checkboxes.find((cb) => {
        const label = cb.closest('label')
        return label?.textContent?.includes('Central Lab')
      })
      expect((centralLabCheckbox as HTMLInputElement)?.checked).toBe(true)
    })
  })

  it('select all / deselect all toggles work', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeTruthy()
    })

    // Click "Select All"
    fireEvent.click(screen.getByText('Select All'))

    await waitFor(() => {
      expect(screen.getByText('Deselect All')).toBeTruthy()
    })
  })

  it('shows in-app toggle as always on/disabled', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('In-App Notifications')).toBeTruthy()
      expect(screen.getByText('Always enabled')).toBeTruthy()
    })
  })

  it('shows SMS phone input when SMS toggle is enabled', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('SMS Notifications')).toBeTruthy()
    })

    // Enable SMS
    const smsCheckbox = screen.getAllByRole('checkbox').find((cb) => {
      const label = cb.closest('label')
      return label?.textContent?.includes('SMS Notifications')
    })
    fireEvent.click(smsCheckbox!)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('+93701234567')).toBeTruthy()
    })
  })

  it('shows email input when email toggle is enabled', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Email Notifications')).toBeTruthy()
    })

    const emailCheckbox = screen.getAllByRole('checkbox').find((cb) => {
      const label = cb.closest('label')
      return label?.textContent?.includes('Email Notifications')
    })
    fireEvent.click(emailCheckbox!)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('officer@district.gov')).toBeTruthy()
    })
  })

  it('validates and saves config on submit', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)
    mockUpdateSurveillanceConfig.mockResolvedValue({ success: true, configId: 'cfg-new' })

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Central Lab')).toBeTruthy()
    })

    // Select a lab
    fireEvent.click(screen.getByText('Select All'))

    // Click save
    fireEvent.click(screen.getByText('Save Configuration'))

    await waitFor(() => {
      expect(mockUpdateSurveillanceConfig).toHaveBeenCalled()
    })
  })

  it('shows error when no labs selected', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeTruthy()
    })

    // Try to save without selecting any lab
    fireEvent.click(screen.getByText('Save Configuration'))

    await waitFor(() => {
      expect(screen.getByText('At least one lab must be selected')).toBeTruthy()
    })
  })

  it('allows adding custom test categories', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New test category name')).toBeTruthy()
    })

    const input = screen.getByPlaceholderText('New test category name')
    fireEvent.change(input, { target: { value: 'HIV Rapid Test' } })
    fireEvent.click(screen.getByText('Add Category'))

    await waitFor(() => {
      const textInputs = screen.getAllByRole('textbox')
      const values = textInputs.map((i) => (i as HTMLInputElement).value)
      expect(values).toContain('HIV Rapid Test')
    })
  })

  it('shows error banner when save fails', async () => {
    mockGetSurveillanceConfig.mockResolvedValue({ config: null })
    mockListLabs.mockResolvedValue(defaultLabs)
    mockUpdateSurveillanceConfig.mockRejectedValue(new Error('Server error'))

    render(<SurveillanceConfigForm />)

    await waitFor(() => {
      expect(screen.getByText('Central Lab')).toBeTruthy()
    })

    // Select all labs so validation passes
    fireEvent.click(screen.getByText('Select All'))
    fireEvent.click(screen.getByText('Save Configuration'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeTruthy()
    })
  })
})

// ─── Alert History Tests ───

describe('SurveillanceAlertHistory', () => {
  it('shows empty state when no alerts', async () => {
    mockListSurveillanceAlerts.mockResolvedValue({ alerts: [], total: 0 })

    render(<SurveillanceAlertHistory />)

    await waitFor(() => {
      expect(screen.getByText(/No surveillance alerts found/)).toBeTruthy()
    })
  })

  it('renders filter tabs', async () => {
    mockListSurveillanceAlerts.mockResolvedValue({ alerts: [], total: 0 })

    render(<SurveillanceAlertHistory />)

    await waitFor(() => {
      expect(screen.getByText('All')).toBeTruthy()
      expect(screen.getByText('Unacknowledged')).toBeTruthy()
      expect(screen.getByText('Acknowledged')).toBeTruthy()
    })
  })

  it('displays alerts in table with correct data', async () => {
    const alertData = {
      alerts: [
        {
          id: 'a1',
          configId: 'cfg-1',
          labId: 'lab-1',
          labName: 'Central Lab',
          testCategory: 'Malaria RDT',
          currentRate: 23,
          threshold: 15,
          triggeredAt: '2026-05-30T10:00:00Z',
          acknowledgedAt: null,
          acknowledgedBy: null,
          notes: null,
        },
        {
          id: 'a2',
          configId: 'cfg-1',
          labId: 'lab-2',
          labName: 'District Lab',
          testCategory: 'TB (Smear)',
          currentRate: 8,
          threshold: 5,
          triggeredAt: '2026-05-29T14:00:00Z',
          acknowledgedAt: '2026-05-29T16:00:00Z',
          acknowledgedBy: 'admin-1',
          notes: 'Reviewed',
        },
      ],
      total: 2,
    }
    mockListSurveillanceAlerts.mockImplementation(() => Promise.resolve(alertData))

    render(<SurveillanceAlertHistory />)

    await waitFor(() => {
      expect(screen.getByText('Central Lab')).toBeTruthy()
      expect(screen.getByText('District Lab')).toBeTruthy()
      expect(screen.getByText('Malaria RDT')).toBeTruthy()
      expect(screen.getByText('TB (Smear)')).toBeTruthy()
    })
  })

  it('opens acknowledge modal when clicking Acknowledge button', async () => {
    mockListSurveillanceAlerts.mockResolvedValue({
      alerts: [
        {
          id: 'a1',
          configId: 'cfg-1',
          labId: 'lab-1',
          labName: 'Central Lab',
          testCategory: 'Malaria RDT',
          currentRate: 23,
          threshold: 15,
          triggeredAt: '2026-05-30T10:00:00Z',
          acknowledgedAt: null,
          acknowledgedBy: null,
          notes: null,
        },
      ],
      total: 1,
    })

    render(<SurveillanceAlertHistory />)

    // Wait for the table action button (not the filter tab)
    await waitFor(() => {
      const actionButtons = screen.getAllByRole('button')
      const ackButton = actionButtons.find(
        (b) => b.textContent === 'Acknowledge' && b.className.includes('text-xs'),
      )
      expect(ackButton).toBeTruthy()
    })

    // Click the action button specifically
    const actionButtons = screen.getAllByRole('button')
    const ackButton = actionButtons.find(
      (b) => b.textContent === 'Acknowledge' && b.className.includes('text-xs'),
    )
    fireEvent.click(ackButton!)

    await waitFor(() => {
      expect(screen.getByText('Acknowledge Alert')).toBeTruthy()
    })
  })

  it('filters change requested data', async () => {
    mockListSurveillanceAlerts.mockResolvedValue({ alerts: [], total: 0 })

    render(<SurveillanceAlertHistory />)

    await waitFor(() => {
      // Filter tabs are present — last occurrence is the status column filter
      const allButtons = screen.getAllByRole('button')
      const unackFilter = allButtons.find((b) => b.textContent === 'Unacknowledged')
      expect(unackFilter).toBeTruthy()
    })

    // Click "Unacknowledged" filter
    const allButtons = screen.getAllByRole('button')
    const unackFilter = allButtons.find((b) => b.textContent === 'Unacknowledged')
    fireEvent.click(unackFilter!)

    await waitFor(() => {
      expect(mockListSurveillanceAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledged: false }),
      )
    })
  })

  it('shows error state when listSurveillanceAlerts fails', async () => {
    mockListSurveillanceAlerts.mockRejectedValue(new Error('Fetch failed'))

    render(<SurveillanceAlertHistory />)

    await waitFor(() => {
      expect(screen.getByText('Fetch failed')).toBeTruthy()
    })
  })
})

// ─── Acknowledge Modal Tests ───

describe('AcknowledgeAlertModal', () => {
  it('renders modal with alert context', () => {
    render(
      <AcknowledgeAlertModal
        alertId="alert-1"
        labName="Central Lab"
        testCategory="Malaria RDT"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText('Acknowledge Alert')).toBeTruthy()
    expect(screen.getByText(/Central Lab/)).toBeTruthy()
    expect(screen.getByText(/Malaria RDT/)).toBeTruthy()
  })

  it('calls acknowledge API and onSuccess when submitted', async () => {
    const onSuccess = vi.fn()
    mockAcknowledgeSurveillanceAlert.mockResolvedValue({ success: true })

    render(
      <AcknowledgeAlertModal
        alertId="alert-1"
        labName="Central Lab"
        testCategory="Malaria RDT"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // Add notes
    const textarea = screen.getByPlaceholderText(/Add any notes/)
    fireEvent.change(textarea, { target: { value: 'False positive' } })

    // Click acknowledge
    const ackButton = screen.getAllByRole('button').find((b) => b.textContent === 'Acknowledge')
    fireEvent.click(ackButton!)

    await waitFor(() => {
      expect(mockAcknowledgeSurveillanceAlert).toHaveBeenCalledWith({
        alertId: 'alert-1',
        notes: 'False positive',
      })
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onOpenChange = vi.fn()

    render(
      <AcknowledgeAlertModal
        alertId="alert-1"
        labName="Central Lab"
        testCategory="Malaria RDT"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows error message when acknowledgment fails', async () => {
    mockAcknowledgeSurveillanceAlert.mockRejectedValue(new Error('Network error'))

    render(
      <AcknowledgeAlertModal
        alertId="alert-1"
        labName="Central Lab"
        testCategory="Malaria RDT"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const ackButton = screen.getAllByRole('button').find((b) => b.textContent === 'Acknowledge')
    fireEvent.click(ackButton!)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })
  })
})
