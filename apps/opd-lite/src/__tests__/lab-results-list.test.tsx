import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../lib/db'
import type { FhirDiagnosticReport } from '@ultranos/shared-types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      let result = key
      Object.entries(values).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v))
      })
      return result
    }
    return key
  },
  useLocale: () => 'en',
}))

// Mock audit
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: {
    READ: 'READ',
    PHI_READ: 'PHI_READ',
    CREATE: 'CREATE',
    EXPORT: 'EXPORT',
  },
  AuditResourceType: {
    LAB_RESULT: 'LAB_RESULT',
    PATIENT: 'PATIENT',
  },
}))

// Mock consent check — grant by default
vi.mock('../lib/consent-check', () => ({
  checkLabsConsent: vi.fn().mockResolvedValue({ granted: true }),
}))

const { LabResultsList } = await import('../components/clinical/LabResultsList')
const { checkLabsConsent } = await import('../lib/consent-check')

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
    issued: new Date().toISOString(),
    effectiveDateTime: new Date().toISOString(),
    performer: [{ reference: 'Organization/lab-1', display: 'Lab Alpha' }],
    _ultranos: {
      createdAt: new Date().toISOString(),
      hlcTimestamp: `${new Date().toISOString()}_0000_node1`,
      isOfflineCreated: false,
    },
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('LabResultsList', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.diagnosticReports.clear()
    vi.mocked(checkLabsConsent).mockResolvedValue({ granted: true })
  })

  it('renders from mocked Dexie data', async () => {
    const report = makeReport()
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument()
    })
    expect(screen.getByText(/Lab Alpha/)).toBeInTheDocument()
  })

  it('shows empty state when no results', async () => {
    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument()
    })
  })

  it('displays urgent indicator for 24h+ unacknowledged results', async () => {
    // Report issued >24h ago
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const report = makeReport({ issued: oldDate, effectiveDateTime: oldDate })
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByTestId('urgent-indicator')).toBeInTheDocument()
      expect(screen.getByText('urgent')).toBeInTheDocument()
    })
  })

  it('does NOT show urgent indicator for acknowledged old results', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const report = makeReport({
      issued: oldDate,
      effectiveDateTime: oldDate,
      acknowledgedAt: new Date().toISOString(),
    } as Partial<FhirDiagnosticReport>)
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('urgent-indicator')).not.toBeInTheDocument()
  })

  it('does NOT show urgent indicator for recent results', async () => {
    const report = makeReport() // issued just now
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('urgent-indicator')).not.toBeInTheDocument()
  })

  it('shows preliminary status badge', async () => {
    const report = makeReport({ status: 'preliminary' })
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('statusPreliminary')).toBeInTheDocument()
    })
  })

  it('shows final status badge', async () => {
    const report = makeReport({ status: 'final' })
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('statusFinal')).toBeInTheDocument()
    })
  })

  it('emits PHI READ audit event on list load', async () => {
    const report = makeReport()
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(mockAuditPhiAccess).toHaveBeenCalledWith(
        'PHI_READ',
        'LAB_RESULT',
        TEST_PATIENT_ID,
        TEST_PATIENT_ID,
        expect.objectContaining({ phiAccess: 'lab_results_list', resultCount: 1 }),
      )
    })
  })

  it('calls onSelectReport when clicking a result', async () => {
    const report = makeReport()
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('CBC panel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('viewAriaLabel'))

    expect(onSelectReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: report.id }),
    )
  })

  it('sorts results by date descending', async () => {
    const older = makeReport({
      effectiveDateTime: '2026-01-01T00:00:00.000Z',
      code: { coding: [{ system: 'http://loinc.org', code: '1', display: 'Older Test' }] },
    })
    const newer = makeReport({
      effectiveDateTime: '2026-05-01T00:00:00.000Z',
      code: { coding: [{ system: 'http://loinc.org', code: '2', display: 'Newer Test' }] },
    })
    await db.diagnosticReports.bulkPut([older, newer])

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(2)
    })

    // Newer should be first in the list
    const items = screen.getAllByRole('listitem')
    expect(items[0]!.textContent).toContain('Newer Test')
    expect(items[1]!.textContent).toContain('Older Test')
  })

  // Consent enforcement tests (Task 6)
  it('blocks access when no consent', async () => {
    vi.mocked(checkLabsConsent).mockResolvedValue({ granted: false, reason: 'no_consent' })

    const report = makeReport()
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByTestId('consent-required')).toBeInTheDocument()
      expect(screen.getByText('consentRequired')).toBeInTheDocument()
    })

    // Should NOT show any lab results
    expect(screen.queryByText('CBC panel')).not.toBeInTheDocument()
  })

  it('shows expired consent message', async () => {
    vi.mocked(checkLabsConsent).mockResolvedValue({ granted: false, reason: 'expired' })

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByTestId('consent-expired')).toBeInTheDocument()
      expect(screen.getByText('consentExpired')).toBeInTheDocument()
    })
  })

  it('shows LOINC code as fallback when no display', async () => {
    const report = makeReport({
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
    })
    await db.diagnosticReports.put(report)

    const onSelectReport = vi.fn()
    render(<LabResultsList patientId={TEST_PATIENT_ID} onSelectReport={onSelectReport} />)

    await waitFor(() => {
      expect(screen.getByText('12345-6')).toBeInTheDocument()
    })
  })
})
