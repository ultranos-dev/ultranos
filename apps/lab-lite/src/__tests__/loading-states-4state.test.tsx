/**
 * 4-state loading tests (loading → error/unavailable → confirmed-empty → data)
 * for six lab-lite surfaces identified as false-negative surfaces.
 *
 * Surfaces:
 * 1. useDriftAlerts — error field exposed; consumer renders unavailable, not silent-nothing
 * 2. useExpiryAlerts — catch added; error field removed (no consumer — WasteDashboardView builds alerts itself)
 * 3. QcHistoryView — load error shows unavailable, not empty
 * 4. StaffHealthDashboard — load error != access-denied
 * 5. DonorReportList — error from hook rendered, not silent-empty
 * 6. useRecentPatients — loading field; consumer shows skeleton, not null-while-loading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Common mocks — must be hoisted
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, _params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      // qc namespace
      'driftUnavailable': 'QC drift alert data unavailable — check QC status manually.',
      'history.loading': 'Loading QC history…',
      'history.empty': 'No QC runs recorded yet.',
      'history.loadError': 'Unable to load QC history. Please try again.',
      'history.title': 'QC History — {analyte}',
      'history.tableLabel': 'QC Run History for {analyte}',
      'history.chartLegend': 'Green = mean · Amber = ±2SD · Red = ±3SD',
      'history.col.date': 'Date',
      'history.col.controlLevel': 'Control Level',
      'history.col.measuredValues': 'Measured Values',
      'history.col.expectedRange': 'Expected Range',
      'history.col.result': 'Result',
      'history.col.tech': 'Technician',
      'result.pass': 'PASS',
      'result.fail': 'FAIL',
      // safety.health namespace
      'staffDashboard': 'Staff Health Dashboard',
      'loadError': 'Unable to load. Please try again.',
      'accessDenied': 'Access Denied',
      'labManagerRequired': 'This dashboard is only accessible to Lab Managers.',
      'totalStaff': 'Total Staff',
      'hepBImmunity': 'Hep B Immune',
      'tbCurrent': 'TB Screening Current',
      'overdueScreenings': 'Overdue Screenings',
      'noStaffRecords': 'No staff health records found.',
      'upToDate': 'Up to date',
      'reminderCount': '{count} reminder(s)',
      // donorReport namespace
      'noReports': 'No donor reports yet',
      'reportHistory': 'Report History',
      'statusDraft': 'Draft',
      'statusFinalized': 'Finalized',
      'exportPdf': 'Export PDF',
      'reviewTitle': 'Review',
      // verification namespace
      'recentPatients': 'Recent Patients',
      'recentPatientsLoading': 'Loading recent patients…',
      'yearsOld': '{age} years',
      'noRecentPatients': 'No recent patients',
      // finance.reagent.waste namespace
      'expiryAlertsUnavailable': 'Expiry alert data unavailable.',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/lib/audit-client', () => ({
  reportQcDriftEvent: vi.fn(),
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) =>
    <button {...props}>{children}</button>,
}))

// ---------------------------------------------------------------------------
// Surface 1: useDriftAlerts — error field
// ---------------------------------------------------------------------------

const mockGetAllActiveDriftAlerts = vi.hoisted(() => vi.fn())

vi.mock('@/lib/qc/drift-detector', () => ({
  getAllActiveDriftAlerts: mockGetAllActiveDriftAlerts,
  acknowledgeDriftAlert: vi.fn().mockResolvedValue(undefined),
}))

import { useDriftAlerts } from '@/hooks/useDriftAlerts'

describe('useDriftAlerts', () => {
  beforeEach(() => {
    mockGetAllActiveDriftAlerts.mockReset()
  })

  it('returns error=true when getAllActiveDriftAlerts throws', async () => {
    mockGetAllActiveDriftAlerts.mockRejectedValue(new Error('DB failure'))
    const { result } = renderHook(() => useDriftAlerts())
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBe(false)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(true)
    expect(result.current.alerts).toHaveLength(0)
  })

  it('returns error=false and alerts when load succeeds', async () => {
    mockGetAllActiveDriftAlerts.mockResolvedValue([
      { id: 'a1', severity: 'REJECT', message: 'Out of control' },
    ])
    const { result } = renderHook(() => useDriftAlerts())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(result.current.alerts).toHaveLength(1)
  })

  it('returns error=false and empty alerts when no active alerts', async () => {
    mockGetAllActiveDriftAlerts.mockResolvedValue([])
    const { result } = renderHook(() => useDriftAlerts())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(result.current.alerts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Surface 2: useExpiryAlerts — catch + error field
// ---------------------------------------------------------------------------

const mockGetActiveReagents = vi.hoisted(() => vi.fn())
const mockGetConsumptionLog = vi.hoisted(() => vi.fn())
const mockProjectExpiry = vi.hoisted(() => vi.fn())
const mockGetDb = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getActiveReagents: mockGetActiveReagents,
    getConsumptionLogForReagent: mockGetConsumptionLog,
    // mockGetDb is used by StaffHealthDashboard (default) and useRecentPatients tests
    getDb: mockGetDb,
  }
})

vi.mock('@/lib/reagent-waste-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    projectExpiryBeforeDepletion: mockProjectExpiry,
    generateExpiryAlert: vi.fn().mockReturnValue(null),
  }
})

import { useExpiryAlerts } from '@/hooks/useExpiryAlerts'

describe('useExpiryAlerts', () => {
  beforeEach(() => {
    mockGetActiveReagents.mockReset()
    mockGetConsumptionLog.mockReset()
    mockProjectExpiry.mockReset()
  })

  it('returns loading=false and empty alerts when getActiveReagents throws', async () => {
    // error field removed — hook swallows the throw and returns empty alerts
    mockGetActiveReagents.mockRejectedValue(new Error('IndexedDB unavailable'))
    const { result } = renderHook(() => useExpiryAlerts())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.alerts).toHaveLength(0)
  })

  it('returns loading=false and empty alerts when no reagents expire early', async () => {
    mockGetActiveReagents.mockResolvedValue([])
    mockProjectExpiry.mockReturnValue(null)
    const { result } = renderHook(() => useExpiryAlerts())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.alerts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Surface 3: QcHistoryView — error state, not empty on load failure
// ---------------------------------------------------------------------------

const mockGetQcRunHistory = vi.hoisted(() => vi.fn())

vi.mock('@/services/qc-run-service', () => ({
  getQcRunHistory: mockGetQcRunHistory,
}))

import { QcHistoryView } from '@/components/qc/QcHistoryView'

describe('QcHistoryView', () => {
  beforeEach(() => {
    mockGetQcRunHistory.mockReset()
  })

  it('shows load error state when getQcRunHistory rejects', async () => {
    mockGetQcRunHistory.mockRejectedValue(new Error('DB error'))
    render(<QcHistoryView analyte="Hemoglobin" instrumentId="instr-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('qc-history-load-error')).toBeInTheDocument()
    })
    // Must NOT show the "no QC runs" empty state
    expect(screen.queryByText('No QC runs recorded yet.')).not.toBeInTheDocument()
  })

  it('shows empty state when no runs exist (genuine zero)', async () => {
    mockGetQcRunHistory.mockResolvedValue([])
    render(<QcHistoryView analyte="Hemoglobin" instrumentId="instr-1" />)

    await waitFor(() => {
      expect(screen.getByText('No QC runs recorded yet.')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('qc-history-load-error')).not.toBeInTheDocument()
  })

  it('shows table when runs loaded successfully', async () => {
    mockGetQcRunHistory.mockResolvedValue([
      {
        id: 'run-1',
        calendarDate: '2026-09-01',
        controlLevel: 'LEVEL_2',
        controlValues: { Hgb: 110 },
        expectedRange: { low: 95, high: 115 },
        passOrFail: 'PASS',
        techId: 'tech-001',
      },
    ])
    render(<QcHistoryView analyte="Hemoglobin" instrumentId="instr-1" />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Surface 4: StaffHealthDashboard — load error vs access denied
// ---------------------------------------------------------------------------

const mockGetAllStaffReminders = vi.hoisted(() => vi.fn())
const mockLabRole = vi.hoisted(() => ({ value: 'LAB_MANAGER' }))

vi.mock('@/lib/safety/screening-reminders', () => ({
  getAllStaffReminders: mockGetAllStaffReminders,
  getReminderState: vi.fn().mockReturnValue('OK'),
}))

vi.mock('@/lib/safety/health-record-crypto', () => ({
  decryptHealthRecord: vi.fn().mockImplementation((r: unknown) => Promise.resolve(r)),
}))

vi.mock('@/lib/consent-crypto', () => ({
  getSessionEncryptionKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
}))

vi.mock('@/components/safety/HealthRecordView', () => ({
  HealthRecordView: () => <div>HealthRecordView</div>,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (sel: (s: { session: { labRole: string } | null }) => unknown) =>
    sel({ session: { labRole: mockLabRole.value } }),
}))

import { StaffHealthDashboard } from '@/components/safety/StaffHealthDashboard'

describe('StaffHealthDashboard', () => {
  beforeEach(() => {
    mockGetAllStaffReminders.mockReset()
    // Default getDb for StaffHealthDashboard (employee_health_records)
    mockGetDb.mockReturnValue({
      employee_health_records: { toArray: vi.fn().mockResolvedValue([]) },
    })
  })

  it('shows loadError UI (not accessDenied) when DB throws for an authenticated manager', async () => {
    mockLabRole.value = 'LAB_MANAGER'
    mockGetAllStaffReminders.mockRejectedValue(new Error('DB error'))

    render(<StaffHealthDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('staff-health-load-error')).toBeInTheDocument()
    })
    // Must NOT show access-denied UI
    expect(screen.queryByTestId('staff-health-access-denied')).not.toBeInTheDocument()
  })

  it('shows accessDenied UI (not loadError) for a non-manager session', async () => {
    mockLabRole.value = 'LAB_TECHNICIAN'
    mockGetAllStaffReminders.mockResolvedValue({})

    render(<StaffHealthDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('staff-health-access-denied')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('staff-health-load-error')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Surface 5: DonorReportList — shows error state on hook error
// ---------------------------------------------------------------------------

const mockUseDonorReports = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useDonorReports', () => ({
  useDonorReports: mockUseDonorReports,
}))

import { DonorReportList } from '@/components/reports/DonorReportList'

describe('DonorReportList', () => {
  beforeEach(() => {
    mockUseDonorReports.mockReset()
  })

  it('shows unavailable error UI when useDonorReports returns an error', () => {
    mockUseDonorReports.mockReturnValue({
      reports: [],
      loading: false,
      error: 'DB failure',
      reload: vi.fn(),
    })
    render(<DonorReportList onOpenReport={vi.fn()} />)

    expect(screen.getByTestId('donor-report-load-error')).toBeInTheDocument()
    // Must NOT show "No donor reports yet"
    expect(screen.queryByText('No donor reports yet')).not.toBeInTheDocument()
  })

  it('shows empty state when reports loaded successfully but empty', () => {
    mockUseDonorReports.mockReturnValue({
      reports: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(<DonorReportList onOpenReport={vi.fn()} />)

    expect(screen.getByText('No donor reports yet')).toBeInTheDocument()
    expect(screen.queryByTestId('donor-report-load-error')).not.toBeInTheDocument()
  })

  it('renders report list when data is loaded', () => {
    const mockReport = {
      id: 'r1',
      programCode: 'WHO',
      programName: 'World Health Organization',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      generatedAt: '2026-04-01T00:00:00Z',
      status: 'finalized' as const,
    }
    mockUseDonorReports.mockReturnValue({
      reports: [mockReport],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(<DonorReportList onOpenReport={vi.fn()} />)

    expect(screen.getByTestId('donor-report-list')).toBeInTheDocument()
    expect(screen.getByText('Report History')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Surface 6: useRecentPatients — loading field distinguishable from empty
// ---------------------------------------------------------------------------

import { useRecentPatients } from '@/hooks/useRecentPatients'

describe('useRecentPatients', () => {
  beforeEach(() => {
    mockGetDb.mockReset()
  })

  it('starts with loading=true before data resolves', async () => {
    let resolveLoad!: (val: unknown[]) => void
    const pendingPromise = new Promise<unknown[]>((res) => { resolveLoad = res })

    mockGetDb.mockReturnValue({
      table: () => ({
        orderBy: () => ({
          reverse: () => ({
            limit: () => ({
              toArray: () => pendingPromise,
            }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useRecentPatients(5))
    // loading should be true immediately
    expect(result.current.loading).toBe(true)
    expect(result.current.patients).toHaveLength(0)

    // Resolve and verify loading=false
    await act(async () => { resolveLoad([]) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.patients).toHaveLength(0)
  })

  it('loading=false and patients populated on success', async () => {
    const mockPatient = { patientId: 'p1', firstName: 'Ahmad', age: 34, verifiedAt: '2026-09-01T00:00:00Z' }
    mockGetDb.mockReturnValue({
      table: () => ({
        orderBy: () => ({
          reverse: () => ({
            limit: () => ({
              toArray: () => Promise.resolve([mockPatient]),
            }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useRecentPatients(5))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.patients).toHaveLength(1)
    expect(result.current.patients[0].firstName).toBe('Ahmad')
  })

  it('loading=false and empty on IndexedDB error', async () => {
    mockGetDb.mockReturnValue({
      table: () => ({
        orderBy: () => ({
          reverse: () => ({
            limit: () => ({
              toArray: () => Promise.reject(new Error('IndexedDB unavailable')),
            }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useRecentPatients(5))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.patients).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Surface 6 (consumer): RecentPatientsList — skeleton while loading
// ---------------------------------------------------------------------------

import { RecentPatientsList } from '@/components/upload/RecentPatientsList'

describe('RecentPatientsList', () => {
  it('renders loading skeleton (not null) while loading=true', () => {
    render(<RecentPatientsList patients={[]} loading={true} onSelect={vi.fn()} />)

    expect(screen.getByTestId('recent-patients-loading')).toBeInTheDocument()
    // Must NOT render the patient list
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders null when loading=false and no patients', () => {
    const { container } = render(<RecentPatientsList patients={[]} loading={false} onSelect={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders patient list when loading=false and patients provided', () => {
    const patients = [{ patientId: 'p1', firstName: 'Laila', age: 28, verifiedAt: '2026-09-01T00:00:00Z' }]
    render(<RecentPatientsList patients={patients} loading={false} onSelect={vi.fn()} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Laila')).toBeInTheDocument()
  })
})
