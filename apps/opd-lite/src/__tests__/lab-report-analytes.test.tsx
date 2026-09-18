import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { FhirDiagnosticReport } from '@ultranos/shared-types'

// next-intl: t returns the key (headers are keys; data cells render real values)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { PHI_READ: 'PHI_READ' },
  AuditResourceType: { LAB_RESULT: 'LAB_RESULT' },
}))

vi.mock('../lib/notification-api', () => ({
  acknowledgeNotification: vi.fn().mockResolvedValue({ success: true }),
  fetchNotifications: () => Promise.resolve({ notifications: [] }),
}))

// db with the analyte store seeded for report-test-1
const ANALYTES = [
  {
    id: 'a1',
    diagnosticReportId: 'report-test-1',
    loincCode: '718-7',
    loincDisplay: 'Hemoglobin',
    valueQuantity: { value: 12.5, unit: 'g/dL' },
    valueString: null,
    interpretation: [{ coding: [{ code: 'L', display: 'Low' }] }],
    referenceRange: { low: 13, high: 17 },
    note: null,
    effectiveDateTime: '2026-05-10',
  },
]
vi.mock('../lib/db', () => ({
  db: {
    diagnosticReports: { update: vi.fn().mockResolvedValue(1) },
    diagnosticReportObservations: {
      where: () => ({ equals: () => ({ toArray: async () => ANALYTES }) }),
    },
  },
}))

// Hub refresh is a no-op in the test (cache-first already has the analytes)
vi.mock('../lib/trpc', () => ({ fetchDiagnosticReportDetail: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Check: () => null,
  Printer: () => null,
  ZoomIn: () => null,
  ZoomOut: () => null,
  Maximize2: () => null,
  X: () => null,
}))
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))
vi.mock('@ultranos/ui-kit/components/ui/image-viewer', () => ({
  ImageViewer: () => null,
}))

const { LabReportDetail } = await import('../components/clinical/LabReportDetail')

function makeReport(overrides: Partial<FhirDiagnosticReport> = {}): FhirDiagnosticReport {
  return {
    id: 'report-test-1',
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }] },
    subject: { reference: 'Patient/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    issued: '2026-05-10T14:30:00.000Z',
    effectiveDateTime: '2026-05-10T10:00:00.000Z',
    performer: [{ reference: 'Organization/lab-1', display: 'Lab Alpha' }],
    _ultranos: { createdAt: '2026-05-10T14:30:00.000Z', hlcTimestamp: 'h', isOfflineCreated: false },
    meta: { versionId: '1', lastUpdated: '2026-05-10T14:30:00.000Z' },
    ...overrides,
  }
}

describe('LabReportDetail — structured analytes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the analyte table (value, unit, reference range) from the local store', async () => {
    render(<LabReportDetail report={makeReport()} onBack={vi.fn()} />)
    expect(await screen.findByText('Hemoglobin')).toBeInTheDocument()
    expect(screen.getByText(/12\.5/)).toBeInTheDocument()
    expect(screen.getByText(/g\/dL/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/13\s*[–-]\s*17/)).toBeInTheDocument())
  })

  it('flags an abnormal analyte with the destructive token', async () => {
    const { container } = render(<LabReportDetail report={makeReport()} onBack={vi.fn()} />)
    await screen.findByText('Hemoglobin')
    // The value cell for a Low (abnormal) analyte carries the destructive text class.
    const abnormalCell = container.querySelector('td.text-destructive')
    expect(abnormalCell).not.toBeNull()
    expect(abnormalCell!.textContent).toContain('12.5')
  })
})
