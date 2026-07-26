import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { FhirDiagnosticReport } from '@ultranos/shared-types'
import type { NotificationItem } from '../lib/notification-api'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock audit
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: {
    READ: 'READ',
    PHI_READ: 'PHI_READ',
  },
  AuditResourceType: {
    LAB_RESULT: 'LAB_RESULT',
  },
}))

// Mock notification API
const mockAcknowledgeNotification = vi.fn().mockResolvedValue({ success: true })
const mockFetchNotifications = vi.fn().mockResolvedValue({ notifications: [] })
vi.mock('../lib/notification-api', () => ({
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  fetchNotifications: () => mockFetchNotifications(),
}))

// Mock db.diagnosticReports.update for acknowledge persistence
vi.mock('../lib/db', () => ({
  db: {
    diagnosticReports: {
      update: vi.fn().mockResolvedValue(1),
    },
  },
}))

const { LabResultDetail } = await import('../components/clinical/LabResultDetail')

const TEST_PATIENT_ID = '11111111-1111-1111-1111-111111111111'
const PATIENT_REF = `Patient/${TEST_PATIENT_ID}`

function makeReport(overrides: Partial<FhirDiagnosticReport> = {}): FhirDiagnosticReport {
  return {
    id: crypto.randomUUID(),
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }],
    },
    subject: { reference: PATIENT_REF },
    issued: '2026-05-10T14:30:00.000Z',
    effectiveDateTime: '2026-05-10T10:00:00.000Z',
    performer: [{ reference: 'Organization/lab-1', display: 'Lab Alpha' }],
    conclusion: 'All values within normal range.',
    _ultranos: {
      createdAt: '2026-05-10T14:30:00.000Z',
      hlcTimestamp: '2026-05-10T14:30:00.000Z_0000_node1',
      isOfflineCreated: false,
    },
    meta: {
      versionId: '1',
      lastUpdated: '2026-05-10T14:30:00.000Z',
    },
    ...overrides,
  }
}

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notif-1',
    type: 'LAB_RESULT_AVAILABLE',
    payload: {
      testCategory: 'CBC',
      labName: 'Lab Alpha',
      diagnosticReportId: 'report-1',
    },
    status: 'SENT',
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    ...overrides,
  }
}

describe('LabResultDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders full DiagnosticReport details', async () => {
    const report = makeReport()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    expect(screen.getByText('CBC panel')).toBeInTheDocument()
    expect(screen.getByText('loincCode')).toBeInTheDocument()
    expect(screen.getByText('statusFinal')).toBeInTheDocument()
    expect(screen.getByText('Lab Alpha')).toBeInTheDocument()
    expect(screen.getByText('All values within normal range.')).toBeInTheDocument()
  })

  it('renders image inline for image attachments', () => {
    const report = makeReport({
      presentedForm: [{
        contentType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        title: 'Lab Scan',
      }],
    })
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    const img = screen.getByAltText('Lab Scan')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
  })

  it('renders PDF inline via embed tag', () => {
    const report = makeReport({
      presentedForm: [{
        contentType: 'application/pdf',
        data: 'JVBERi0x',
        title: 'Lab Report PDF',
      }],
    })
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    const embed = screen.getByTitle('Lab Report PDF')
    expect(embed).toBeInTheDocument()
    expect(embed.tagName).toBe('EMBED')
  })

  it('shows acknowledge button when notification is unread', () => {
    const report = makeReport()
    const notification = makeNotification()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} notification={notification} onBack={onBack} />)

    expect(screen.getByTestId('acknowledge-button')).toBeInTheDocument()
    expect(screen.getByText('acknowledge')).toBeInTheDocument()
  })

  it('calls acknowledgeNotification on button click', async () => {
    const report = makeReport()
    const notification = makeNotification()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} notification={notification} onBack={onBack} />)

    fireEvent.click(screen.getByTestId('acknowledge-button'))

    await waitFor(() => {
      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('notif-1')
    })

    // Should show acknowledged state
    await waitFor(() => {
      expect(screen.getByText('acknowledged')).toBeInTheDocument()
    })
  })

  it('does not show acknowledge button when already acknowledged', () => {
    const report = makeReport()
    const notification = makeNotification({ status: 'ACKNOWLEDGED' })
    const onBack = vi.fn()

    render(<LabResultDetail report={report} notification={notification} onBack={onBack} />)

    expect(screen.queryByTestId('acknowledge-button')).not.toBeInTheDocument()
  })

  it('emits PHI READ audit event on detail view', () => {
    const report = makeReport()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'LAB_RESULT',
      report.id,
      TEST_PATIENT_ID,
      expect.objectContaining({ phiAccess: 'lab_result_detail_view' }),
    )
  })

  it('calls onBack when back button is clicked', () => {
    const report = makeReport()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    fireEvent.click(screen.getByLabelText('backAriaLabel'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows text summary when no conclusion and no attachments', () => {
    const report = makeReport({ conclusion: undefined, presentedForm: undefined })
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    expect(screen.getByText('noContent')).toBeInTheDocument()
  })

  it('does not show acknowledge button when no notification and none found', () => {
    mockFetchNotifications.mockResolvedValue({ notifications: [] })
    const report = makeReport()
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    expect(screen.queryByTestId('acknowledge-button')).not.toBeInTheDocument()
  })

  it('self-lookups notification when not passed as prop', async () => {
    const reportId = 'self-lookup-report'
    const report = makeReport({ id: reportId })
    const notification = makeNotification({
      payload: { diagnosticReportId: reportId, testCategory: 'CBC', labName: 'Lab Alpha' },
      status: 'SENT',
    })
    mockFetchNotifications.mockResolvedValue({ notifications: [notification] })
    const onBack = vi.fn()

    render(<LabResultDetail report={report} onBack={onBack} />)

    // Should find the notification and show acknowledge button
    await waitFor(() => {
      expect(screen.getByTestId('acknowledge-button')).toBeInTheDocument()
    })
  })
})
