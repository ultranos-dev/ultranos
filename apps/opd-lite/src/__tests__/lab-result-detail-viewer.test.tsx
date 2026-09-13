import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { LocalDiagnosticReport } from '@/lib/db'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock audit — spy captures all calls
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: { PHI_READ: 'PHI_READ' },
  AuditResourceType: { LAB_RESULT: 'LAB_RESULT' },
}))

// Mock notification API
const mockFetchNotifications = vi.fn().mockResolvedValue({ notifications: [] })
vi.mock('../lib/notification-api', () => ({
  acknowledgeNotification: vi.fn().mockResolvedValue({ success: true }),
  fetchNotifications: () => mockFetchNotifications(),
}))

// Mock db
vi.mock('../lib/db', () => ({
  db: { diagnosticReports: { update: vi.fn().mockResolvedValue(1) } },
}))

// Mock @ultranos/ui-kit/icons (Check used by LabResultDetail)
vi.mock('@ultranos/ui-kit/icons', () => ({
  Check: () => null,
  Printer: () => null,
  ZoomIn: () => <span>zoom-in-icon</span>,
  ZoomOut: () => null,
  Maximize2: () => null,
  X: () => null,
}))

// Mock @/components/ui/Button
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

// Mock ImageViewer: renders zoom-in button only when open=true
vi.mock('@ultranos/ui-kit/components/ui/image-viewer', () => ({
  ImageViewer: ({ open, onOpenChange }: { open: boolean; src: string; alt?: string; onOpenChange: (o: boolean) => void }) =>
    open
      ? (
        <div role="dialog" aria-label="Image viewer">
          <button type="button" aria-label="Zoom in" onClick={() => {}}>Zoom in</button>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)}>Close</button>
        </div>
      )
      : null,
}))

// Import AFTER all mocks are set up
const { LabResultDetail } = await import('../components/clinical/LabResultDetail')

const TEST_PATIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const PATIENT_REF = `Patient/${TEST_PATIENT_ID}`

function makeReport(overrides: Partial<LocalDiagnosticReport> = {}): LocalDiagnosticReport {
  return {
    id: 'report-result-1',
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }],
    },
    subject: { reference: PATIENT_REF },
    issued: '2026-05-10T14:30:00.000Z',
    effectiveDateTime: '2026-05-10T10:00:00.000Z',
    performer: [{ reference: 'Organization/lab-1', display: 'Lab Alpha' }],
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
  } as LocalDiagnosticReport
}

describe('LabResultDetail — ImageViewer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a clickable image trigger for a webp attachment', () => {
    const report = makeReport({
      presentedForm: [{ contentType: 'image/webp', data: 'AA', title: 'cell' }],
    })
    render(<LabResultDetail report={report} onBack={vi.fn()} />)

    const img = screen.getByAltText('cell')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
  })

  it('opens the ImageViewer when a webp attachment is clicked and audits the view', () => {
    const report = makeReport({
      presentedForm: [{ contentType: 'image/webp', data: 'AA', title: 'cell' }],
    })
    render(<LabResultDetail report={report} onBack={vi.fn()} />)

    // Viewer should not be open initially
    expect(screen.queryByRole('button', { name: /zoom in/i })).not.toBeInTheDocument()

    // Click the image trigger button (wraps the img)
    const img = screen.getByAltText('cell')
    const trigger = img.closest('button')
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger!)

    // ImageViewer should now be open — zoom-in button is rendered
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()

    // Audit should have been called with the attachment-view metadata
    const attachmentAuditCall = mockAuditPhiAccess.mock.calls.find(
      (call) => call[4]?.phiAccess === 'lab_result_attachment_view',
    )
    expect(attachmentAuditCall).toBeDefined()
    expect(attachmentAuditCall![0]).toBe('PHI_READ')
    expect(attachmentAuditCall![1]).toBe('LAB_RESULT')
    expect(attachmentAuditCall![2]).toBe('report-result-1')
    expect(attachmentAuditCall![3]).toBe(TEST_PATIENT_ID)
    expect(attachmentAuditCall![4]).toEqual(
      expect.objectContaining({ phiAccess: 'lab_result_attachment_view' }),
    )
  })

  it('closes the ImageViewer when close button is clicked', () => {
    const report = makeReport({
      presentedForm: [{ contentType: 'image/webp', data: 'AA', title: 'cell' }],
    })
    render(<LabResultDetail report={report} onBack={vi.fn()} />)

    const trigger = screen.getByAltText('cell').closest('button')!
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('button', { name: /zoom in/i })).not.toBeInTheDocument()
  })

  it('emits the detail-view PHI_READ audit on mount (not the attachment audit)', () => {
    const report = makeReport()
    render(<LabResultDetail report={report} onBack={vi.fn()} />)

    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      'PHI_READ',
      'LAB_RESULT',
      'report-result-1',
      TEST_PATIENT_ID,
      expect.objectContaining({ phiAccess: 'lab_result_detail_view' }),
    )
  })
})
