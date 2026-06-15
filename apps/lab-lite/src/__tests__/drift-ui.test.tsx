/**
 * Drift Alert UI Component Tests — Story 43.6
 *
 * Tests AC 9.16–9.18: DriftAlertBanner, DriftAlertAcknowledgment, WestgardHistoryView
 * including RTL snapshot tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { DriftAlert } from '@/lib/qc/types'
import { DriftAlertBanner } from '@/components/qc/DriftAlertBanner'
import { DriftAlertAcknowledgment } from '@/components/qc/DriftAlertAcknowledgment'
import { WestgardHistoryView } from '@/components/qc/WestgardHistoryView'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      // DriftAlertBanner translations (keys as passed to t() after namespace 'qc')
      'driftRejectTitle': 'QC Out of Control',
      'driftWarningTitle': 'QC Warning',
      'acknowledge': 'Acknowledge',
      'acknowledgeAlert': 'Acknowledge Alert',
      'viewHistory': 'View QC History',
      'viewQcHistory': 'View QC History',
      // DriftAlertAcknowledgment
      'acknowledgeAlertTitle': 'Acknowledge Drift Alert',
      'resolutionActionLabel': 'Resolution Action',
      'resolutionRequired': 'Please select a resolution action',
      'notesLabel': 'Notes',
      'optional': 'optional',
      'notesPlaceholder': 'Add notes...',
      'cancel': 'Cancel',
      'confirmAcknowledge': 'Confirm',
      'acknowledging': 'Acknowledging...',
      'acknowledgeError': 'Failed to acknowledge alert',
      'resolution.recalibrated': 'Recalibrated',
      'resolution.maintenancePerformed': 'Maintenance Performed',
      'resolution.falseAlarmVerified': 'False Alarm Verified',
      'resolution.deferredToSupervisor': 'Deferred to Supervisor',
      // WestgardHistoryView
      'history.empty': 'No QC runs recorded yet.',
      'history.tableLabel': 'QC Run History',
      'history.col.date': 'Run Date',
      'history.col.controlLevel': 'Control Level',
      'col.targetMean': 'Target Mean',
      'col.targetSd': 'Target SD',
      'col.observedValue': 'Observed Value',
      'col.deviation': 'Deviation (SD)',
      'col.status': 'Status',
      'trendConsecutive': 'consecutive values',
      'trendDirectionUp': 'trending upward',
      'trendDirectionDown': 'trending downward',
      'alertHistoryTitle': 'Drift Alert History',
      'statusResolved': 'RESOLVED',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/lib/qc/drift-detector', () => ({
  acknowledgeDriftAlert: vi.fn().mockResolvedValue(undefined),
  getAllActiveDriftAlerts: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/audit-client', () => ({
  reportQcDriftEvent: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { userId: string } }) => unknown) =>
    selector({ session: { userId: 'tech-001' } }),
}))

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAlert(overrides: Partial<DriftAlert> = {}): DriftAlert {
  return {
    id: 'alert-001',
    analyte: 'Hemoglobin',
    loincCode: '718-7',
    instrumentId: 'instr-abc',
    controlLevel: 'LEVEL_2',
    ruleViolated: '1_3S',
    severity: 'REJECT',
    message: 'REJECT: latest value (116.00) exceeds ±3SD limit. Stop testing and recalibrate.',
    consecutiveCount: 1,
    detectedAt: new Date().toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolution: null,
    resolutionNotes: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// DriftAlertBanner tests (AC 9.16)
// ---------------------------------------------------------------------------

describe('DriftAlertBanner', () => {

  // AC 9.16: drift alert banner renders with correct severity styling
  it('renders nothing when alerts array is empty', () => {
    const { container } = render(<DriftAlertBanner alerts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders banner for a REJECT alert with red styling', () => {
    render(<DriftAlertBanner alerts={[makeAlert({ severity: 'REJECT' })]} />)
    const banner = screen.getByTestId('drift-alert-banner')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('data-severity', 'REJECT')
    expect(banner.className).toContain('bg-red-50')
  })

  it('renders banner for a WARNING alert with amber styling', () => {
    render(<DriftAlertBanner alerts={[makeAlert({ severity: 'WARNING', ruleViolated: '1_2S' })]} />)
    const banner = screen.getByTestId('drift-alert-banner')
    expect(banner).toHaveAttribute('data-severity', 'WARNING')
    expect(banner.className).toContain('bg-amber-50')
  })

  it('shows the alert message text', () => {
    const message = 'REJECT: latest value exceeds ±3SD limit.'
    render(<DriftAlertBanner alerts={[makeAlert({ message })]} />)
    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('has acknowledge and view history buttons', () => {
    render(<DriftAlertBanner alerts={[makeAlert()]} />)
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view qc history/i })).toBeInTheDocument()
  })

  it('shows acknowledgment dialog when Acknowledge is clicked', () => {
    render(<DriftAlertBanner alerts={[makeAlert()]} />)
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders as a live region for screen readers', () => {
    render(<DriftAlertBanner alerts={[makeAlert()]} />)
    const banner = screen.getByRole('alert')
    expect(banner).toHaveAttribute('aria-live', 'assertive')
  })
})

// ---------------------------------------------------------------------------
// DriftAlertAcknowledgment tests (AC 9.17)
// ---------------------------------------------------------------------------

describe('DriftAlertAcknowledgment', () => {
  const onComplete = vi.fn()
  const onCancel = vi.fn()

  afterEach(() => {
    onComplete.mockClear()
    onCancel.mockClear()
  })

  // AC 9.17: acknowledgment dialog requires resolution selection
  it('renders the dialog with all resolution options', () => {
    render(
      <DriftAlertAcknowledgment
        alert={makeAlert()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Recalibrated')).toBeInTheDocument()
    expect(screen.getByText('Maintenance Performed')).toBeInTheDocument()
    expect(screen.getByText('False Alarm Verified')).toBeInTheDocument()
    expect(screen.getByText('Deferred to Supervisor')).toBeInTheDocument()
  })

  it('shows error when submit attempted without resolution', async () => {
    render(
      <DriftAlertAcknowledgment
        alert={makeAlert()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    )
    // Click submit without selecting resolution
    const submitButton = screen.getByRole('button', { name: /confirm/i })
    fireEvent.click(submitButton)
    // Error message appears
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('allows submission when resolution is selected', async () => {
    render(
      <DriftAlertAcknowledgment
        alert={makeAlert()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    )
    // Select a resolution
    const recalibratedOption = screen.getByDisplayValue('RECALIBRATED')
    fireEvent.click(recalibratedOption)

    // Submit
    const submitButton = screen.getByRole('button', { name: /confirm/i })
    fireEvent.click(submitButton)

    // Wait for async acknowledgment
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(
      <DriftAlertAcknowledgment
        alert={makeAlert()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows the alert severity and rule in the dialog', () => {
    render(
      <DriftAlertAcknowledgment
        alert={makeAlert({ severity: 'REJECT', ruleViolated: '1_3S' })}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText('REJECT')).toBeInTheDocument()
    expect(screen.getByText('1_3S')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// WestgardHistoryView tests and RTL snapshots (AC 9.18)
// ---------------------------------------------------------------------------

import type { QcRun } from '@/lib/qc/types'

describe('WestgardHistoryView', () => {

  function makeRun(overrides: Partial<QcRun> = {}): QcRun {
    return {
      id: crypto.randomUUID(),
      analyte: 'Hemoglobin',
      loincCode: '718-7',
      instrumentId: 'instr-abc',
      controlLevel: 'LEVEL_2',
      targetMean: 100,
      targetSd: 5,
      observedValue: 100,
      runDate: new Date().toISOString(),
      runBy: 'tech-001',
      hlcTimestamp: new Date().toISOString(),
      ...overrides,
    }
  }

  it('renders empty state when no runs', () => {
    render(<WestgardHistoryView runs={[]} alerts={[]} />)
    expect(screen.getByText('No QC runs recorded yet.')).toBeInTheDocument()
  })

  it('renders table with run data', () => {
    const runs = [
      makeRun({ observedValue: 100.5, runDate: '2026-01-01' }),
      makeRun({ observedValue: 101.0, runDate: '2026-01-02' }),
    ]
    render(<WestgardHistoryView runs={runs} alerts={[]} />)
    // Table should be present
    expect(screen.getByRole('table')).toBeInTheDocument()
    // Should have "Run Date" column
    expect(screen.getByText('Run Date')).toBeInTheDocument()
  })

  it('shows trend indicator when 5+ consecutive increasing values exist', () => {
    const runs = [
      makeRun({ observedValue: 100, runDate: '2026-01-01' }),
      makeRun({ observedValue: 101, runDate: '2026-01-02' }),
      makeRun({ observedValue: 102, runDate: '2026-01-03' }),
      makeRun({ observedValue: 103, runDate: '2026-01-04' }),
      makeRun({ observedValue: 104, runDate: '2026-01-05' }),
      makeRun({ observedValue: 105, runDate: '2026-01-06' }),
    ]
    render(<WestgardHistoryView runs={runs} alerts={[]} />)
    expect(screen.getByTestId('trend-indicator')).toBeInTheDocument()
  })

  it('does not show trend indicator for non-directional data', () => {
    const runs = [
      makeRun({ observedValue: 100, runDate: '2026-01-01' }),
      makeRun({ observedValue: 105, runDate: '2026-01-02' }),
      makeRun({ observedValue: 99, runDate: '2026-01-03' }),
    ]
    render(<WestgardHistoryView runs={runs} alerts={[]} />)
    expect(screen.queryByTestId('trend-indicator')).not.toBeInTheDocument()
  })

  it('shows drift alert history section when alerts provided', () => {
    const alerts: DriftAlert[] = [makeAlert()]
    render(<WestgardHistoryView runs={[makeRun()]} alerts={alerts} />)
    expect(screen.getByText('Drift Alert History')).toBeInTheDocument()
  })

  // AC 9.18: RTL snapshot tests
  describe('RTL snapshots', () => {
    afterEach(() => {
      document.dir = 'ltr'
    })

    it('DriftAlertBanner renders correctly in LTR', () => {
      document.dir = 'ltr'
      const { container } = render(<DriftAlertBanner alerts={[makeAlert()]} />)
      expect(container).toMatchSnapshot()
    })

    it('DriftAlertBanner renders correctly in RTL', () => {
      document.dir = 'rtl'
      const { container } = render(<DriftAlertBanner alerts={[makeAlert()]} />)
      expect(container).toMatchSnapshot()
    })

    it('WestgardHistoryView renders correctly in LTR', () => {
      const runs = [makeRun({ observedValue: 100.5 })]
      document.dir = 'ltr'
      const { container } = render(<WestgardHistoryView runs={runs} alerts={[]} />)
      expect(container).toMatchSnapshot()
    })

    it('WestgardHistoryView renders correctly in RTL', () => {
      const runs = [makeRun({ observedValue: 100.5 })]
      document.dir = 'rtl'
      const { container } = render(<WestgardHistoryView runs={runs} alerts={[]} />)
      expect(container).toMatchSnapshot()
    })
  })
})
