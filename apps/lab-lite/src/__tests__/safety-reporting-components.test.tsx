/**
 * Component tests for Story 47.6 — Anonymous Safety Reporting
 * Tasks 12.4 (AnonymousReportForm), 12.5 (SafetyReportManagement), 12.6 (SafetyTrendDashboard)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  SafetyConcernCategory,
  ReportStatus,
  type SafetyReport,
} from '../types/safety-reporting'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockSubmitAnonymousReport = vi.fn()
const mockAcknowledgeReport = vi.fn()
const mockUpdateInvestigation = vi.fn()
const mockCloseReport = vi.fn()
vi.mock('@/lib/safety/safety-report-service', () => ({
  submitAnonymousReport: (...args: unknown[]) => mockSubmitAnonymousReport(...args),
  acknowledgeReport: (...args: unknown[]) => mockAcknowledgeReport(...args),
  updateInvestigation: (...args: unknown[]) => mockUpdateInvestigation(...args),
  closeReport: (...args: unknown[]) => mockCloseReport(...args),
}))

const mockGetSafetyReports = vi.fn()
vi.mock('@/lib/db', () => ({
  getSafetyReports: (...args: unknown[]) => mockGetSafetyReports(...args),
}))

const mockUseRequireLabRole = vi.fn()
vi.mock('@/hooks/useLabPermission', () => ({
  useRequireLabRole: (...args: unknown[]) => mockUseRequireLabRole(...args),
}))

let mockSession: { userId: string; labRole: string } | null = {
  userId: 'manager-001',
  labRole: 'LAB_MANAGER',
}
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Droplets: () => <span data-testid="icon-droplets" />,
  ShieldAlert: () => <span data-testid="icon-shield-alert" />,
  Trash2: () => <span data-testid="icon-trash2" />,
  AlertTriangle: () => <span data-testid="icon-alert-triangle" />,
  ClipboardList: () => <span data-testid="icon-clipboard-list" />,
  Lock: () => <span data-testid="icon-lock" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { fullWidth?: boolean; variant?: string }) => (
    <button onClick={onClick} disabled={disabled} data-variant={props.variant} {...props}>
      {children}
    </button>
  ),
}))

// Import after mocks
import { AnonymousReportForm } from '../components/safety/AnonymousReportForm'
import { SafetyReportManagement } from '../components/safety/SafetyReportManagement'
import { SafetyTrendDashboard } from '../components/safety/SafetyTrendDashboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<SafetyReport> = {}): SafetyReport {
  const roundedTime = new Date()
  roundedTime.setMinutes(0, 0, 0)
  return {
    id: crypto.randomUUID(),
    category: SafetyConcernCategory.HAND_HYGIENE,
    details: 'Test safety concern details for hand hygiene observation',
    submittedAt: roundedTime.toISOString(),
    status: ReportStatus.SUBMITTED,
    resolution: null,
    acknowledgedAt: null,
    closedAt: null,
    investigatorNotes: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// AnonymousReportForm
// ---------------------------------------------------------------------------

describe('AnonymousReportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmitAnonymousReport.mockResolvedValue('report-uuid-123')
  })

  it('renders privacy notice prominently', () => {
    render(<AnonymousReportForm />)
    expect(screen.getByText('privacyNoticeTitle')).toBeDefined()
    expect(screen.getByText('privacyNoticeBody')).toBeDefined()
    expect(screen.getByTestId('icon-lock')).toBeDefined()
  })

  it('renders all 5 concern category buttons', () => {
    render(<AnonymousReportForm />)
    expect(screen.getByText('category.HAND_HYGIENE')).toBeDefined()
    expect(screen.getByText('category.PPE_NON_USE')).toBeDefined()
    expect(screen.getByText('category.IMPROPER_WASTE_DISPOSAL')).toBeDefined()
    expect(screen.getByText('category.EQUIPMENT_MISUSE')).toBeDefined()
    expect(screen.getByText('category.OTHER')).toBeDefined()
  })

  it('renders lucide icons for each category (not emoji)', () => {
    render(<AnonymousReportForm />)
    expect(screen.getByTestId('icon-droplets')).toBeDefined()
    expect(screen.getByTestId('icon-shield-alert')).toBeDefined()
    expect(screen.getByTestId('icon-trash2')).toBeDefined()
    expect(screen.getByTestId('icon-alert-triangle')).toBeDefined()
    expect(screen.getByTestId('icon-clipboard-list')).toBeDefined()
  })

  it('submit button is disabled when no category is selected', () => {
    render(<AnonymousReportForm />)
    const submitBtn = screen.getByText('submitButton')
    expect(submitBtn.closest('button')).toHaveProperty('disabled', true)
  })

  it('submit button is disabled when details are too short (< 10 chars)', () => {
    render(<AnonymousReportForm />)
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Short' } })
    const submitBtn = screen.getByText('submitButton')
    expect(submitBtn.closest('button')).toHaveProperty('disabled', true)
  })

  it('submit button is enabled with category + valid details', () => {
    render(<AnonymousReportForm />)
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'This is a valid safety concern description.' } })
    const submitBtn = screen.getByText('submitButton')
    expect(submitBtn.closest('button')).toHaveProperty('disabled', false)
  })

  it('shows confirmation with report ID after successful submission', async () => {
    render(<AnonymousReportForm />)
    fireEvent.click(screen.getByText('category.PPE_NON_USE'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Technician observed without PPE during specimen handling.' } })
    fireEvent.click(screen.getByText('submitButton'))

    await waitFor(() => {
      expect(screen.getByText('confirmationTitle')).toBeDefined()
      expect(screen.getByText(/report-uuid-123/)).toBeDefined()
    })
  })

  it('shows error message on submission failure', async () => {
    mockSubmitAnonymousReport.mockRejectedValue(new Error('DB error'))
    render(<AnonymousReportForm />)
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Valid description of the concern observed.' } })
    fireEvent.click(screen.getByText('submitButton'))

    await waitFor(() => {
      expect(screen.getByText('submitError')).toBeDefined()
    })
  })

  it('RTL snapshot — form layout mirrors correctly', () => {
    const { container } = render(
      <div dir="rtl">
        <AnonymousReportForm />
      </div>
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// SafetyReportManagement
// ---------------------------------------------------------------------------

describe('SafetyReportManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRequireLabRole.mockReturnValue(true)
    mockSession = { userId: 'manager-001', labRole: 'LAB_MANAGER' }
    mockGetSafetyReports.mockResolvedValue([])
  })

  it('shows access-denied message for non-managers', async () => {
    mockUseRequireLabRole.mockReturnValue(false)
    render(<SafetyReportManagement />)
    await waitFor(() => {
      expect(screen.getByText('managerOnly')).toBeDefined()
    })
  })

  it('shows empty state when no reports exist', async () => {
    mockGetSafetyReports.mockResolvedValue([])
    render(<SafetyReportManagement />)
    await waitFor(() => {
      expect(screen.getByText('noReports')).toBeDefined()
    })
  })

  it('renders report list for lab managers', async () => {
    mockGetSafetyReports.mockResolvedValue([
      makeReport({ category: SafetyConcernCategory.PPE_NON_USE }),
      makeReport({ category: SafetyConcernCategory.HAND_HYGIENE }),
    ])
    render(<SafetyReportManagement />)
    await waitFor(() => {
      expect(screen.getAllByText('category.PPE_NON_USE').length).toBeGreaterThan(0)
      expect(screen.getAllByText('category.HAND_HYGIENE').length).toBeGreaterThan(0)
    })
  })

  it('shows detail view with Acknowledge button for SUBMITTED reports', async () => {
    const report = makeReport({ status: ReportStatus.SUBMITTED })
    mockGetSafetyReports.mockResolvedValue([report])
    mockAcknowledgeReport.mockResolvedValue(undefined)

    render(<SafetyReportManagement />)
    await waitFor(() => screen.getByText('category.HAND_HYGIENE'))
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))

    await waitFor(() => {
      expect(screen.getByText('acknowledgeButton')).toBeDefined()
    })
  })

  it('calls acknowledgeReport on Acknowledge button click', async () => {
    const report = makeReport({ status: ReportStatus.SUBMITTED })
    mockGetSafetyReports.mockResolvedValue([report])
    mockAcknowledgeReport.mockResolvedValue(undefined)

    render(<SafetyReportManagement />)
    await waitFor(() => screen.getByText('category.HAND_HYGIENE'))
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))
    await waitFor(() => screen.getByText('acknowledgeButton'))
    fireEvent.click(screen.getByText('acknowledgeButton'))

    await waitFor(() => {
      expect(mockAcknowledgeReport).toHaveBeenCalledWith(report.id, 'manager-001')
    })
  })

  it('disables action buttons when session has no userId', async () => {
    mockSession = null
    const report = makeReport({ status: ReportStatus.SUBMITTED })
    mockGetSafetyReports.mockResolvedValue([report])

    render(<SafetyReportManagement />)
    await waitFor(() => screen.getByText('category.HAND_HYGIENE'))
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))
    await waitFor(() => screen.getByText('acknowledgeButton'))

    expect(screen.getByText('acknowledgeButton').closest('button')).toHaveProperty('disabled', true)
  })

  it('shows close form for SUBMITTED reports (direct close path)', async () => {
    const report = makeReport({ status: ReportStatus.SUBMITTED })
    mockGetSafetyReports.mockResolvedValue([report])

    render(<SafetyReportManagement />)
    await waitFor(() => screen.getByText('category.HAND_HYGIENE'))
    fireEvent.click(screen.getByText('category.HAND_HYGIENE'))

    await waitFor(() => {
      expect(screen.getByText('closeReportButton')).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// SafetyTrendDashboard
// ---------------------------------------------------------------------------

describe('SafetyTrendDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRequireLabRole.mockReturnValue(true)
    mockGetSafetyReports.mockResolvedValue([])
  })

  it('shows access-denied for non-managers', async () => {
    mockUseRequireLabRole.mockReturnValue(false)
    render(<SafetyTrendDashboard />)
    await waitFor(() => {
      expect(screen.getByText('managerOnly')).toBeDefined()
    })
  })

  it('shows empty state message when no reports exist in period', async () => {
    mockGetSafetyReports.mockResolvedValue([])
    render(<SafetyTrendDashboard />)
    await waitFor(() => {
      expect(screen.getByText('noDataForPeriod')).toBeDefined()
    })
  })

  it('renders summary cards when reports are present', async () => {
    const now = new Date()
    const reports = [
      makeReport({
        submittedAt: now.toISOString(),
        status: ReportStatus.CLOSED,
        closedAt: now.toISOString(),
        acknowledgedAt: now.toISOString(),
      }),
    ]
    mockGetSafetyReports.mockResolvedValue(reports)
    render(<SafetyTrendDashboard />)

    await waitFor(() => {
      expect(screen.getByText('totalReports')).toBeDefined()
      expect(screen.getByText('resolutionRate')).toBeDefined()
      expect(screen.getByText('avgAckTime')).toBeDefined()
      expect(screen.getByText('avgCloseTime')).toBeDefined()
    })
  })

  it('shows recurring issues section for categories with 3+ reports', async () => {
    const now = new Date()
    const reports = Array.from({ length: 3 }, () =>
      makeReport({
        submittedAt: now.toISOString(),
        category: SafetyConcernCategory.PPE_NON_USE,
      })
    )
    mockGetSafetyReports.mockResolvedValue(reports)
    render(<SafetyTrendDashboard />)

    await waitFor(() => {
      expect(screen.getByText('recurringIssues')).toBeDefined()
    })
  })

  it('renders period selector with 30d, 90d, 12m options', async () => {
    mockGetSafetyReports.mockResolvedValue([makeReport({ submittedAt: new Date().toISOString() })])
    render(<SafetyTrendDashboard />)

    await waitFor(() => {
      expect(screen.getByText('period.30d')).toBeDefined()
      expect(screen.getByText('period.90d')).toBeDefined()
      expect(screen.getByText('period.12m')).toBeDefined()
    })
  })

  it('handles null closedAt on CLOSED reports without crashing', async () => {
    // Report with CLOSED status but no closedAt (state machine guard bypass scenario)
    const report = makeReport({ status: ReportStatus.CLOSED, closedAt: null })
    report.submittedAt = new Date().toISOString()
    mockGetSafetyReports.mockResolvedValue([report])

    expect(() => render(<SafetyTrendDashboard />)).not.toThrow()
    await waitFor(() => {
      expect(screen.getByText('totalReports')).toBeDefined()
    })
  })
})
