/**
 * WasteDashboardView tests — expiry-alerts unavailable state
 *
 * AC: when the expiry-alert build step fails (getConsumptionLogForReagent throws
 * while iterating active reagents), the component must render the
 * `data-testid="expiry-alerts-unavailable"` notice and must NOT render a
 * "no expiry alerts" / empty-state message.
 *
 * The outer load (getAllReagents + getActiveReagents) succeeds so the component
 * renders past its loading spinner; only the nested expiry loop rejects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock functions
// ---------------------------------------------------------------------------

const {
  mockGetAllReagents,
  mockGetActiveReagents,
  mockGetConsumptionLog,
} = vi.hoisted(() => ({
  mockGetAllReagents: vi.fn(),
  mockGetActiveReagents: vi.fn(),
  mockGetConsumptionLog: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, _params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      'loading': 'Loading…',
      'expiryAlertsUnavailable': 'Expiry alert data unavailable.',
      'expiryAlertsHeading': 'Expiry Alerts',
      'expiryAlertIcon': 'Expiry alert',
      'totalTracked': 'Total Tracked',
      'overallEfficiency': 'Overall Efficiency',
      'wasteRate': 'Waste Rate',
      'financialLoss': 'Financial Loss',
      'activeReagentsHeading': 'Active Reagents',
      'noActiveReagents': 'No active reagents.',
      'addReagent': 'Add Reagent',
      'wasteHistoryHeading': 'Waste History',
      'col.name': 'Name',
      'col.lot': 'Lot',
      'col.openDate': 'Open Date',
      'col.expiryDate': 'Expiry Date',
      'col.disposalDate': 'Disposal Date',
      'col.progress': 'Progress',
      'col.efficiency': 'Efficiency',
      'col.daysLeft': 'Days Left',
      'col.alert': 'Alert',
      'col.wasteReason': 'Waste Reason',
      'col.financialLoss': 'Financial Loss',
      'period.this_month': 'This Month',
      'period.last_month': 'Last Month',
      'period.3_months': '3 Months',
      'period.6_months': '6 Months',
      'alerts.expiryWarning': 'Expiry warning',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/lib/db', () => ({
  getAllReagents: mockGetAllReagents,
  getActiveReagents: mockGetActiveReagents,
  getConsumptionLogForReagent: mockGetConsumptionLog,
  ReagentStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', DISPOSED: 'DISPOSED' },
}))

vi.mock('@/lib/reagent-waste-service', () => ({
  calculateConsumptionEfficiency: vi.fn().mockReturnValue(1),
  calculateWasteRate: vi.fn().mockReturnValue(0),
  calculateFinancialLoss: vi.fn().mockReturnValue(0),
  calculateFinancialLossByPeriod: vi.fn().mockReturnValue(0),
  projectExpiryBeforeDepletion: vi.fn().mockReturnValue(null),
  generateExpiryAlert: vi.fn().mockReturnValue(null),
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { WasteDashboardView } from '@/components/finance/WasteDashboardView'

// ---------------------------------------------------------------------------
// A minimal active reagent fixture (no PHI — reagent metadata only)
// ---------------------------------------------------------------------------

const activeReagent = {
  reagentId: 'rgnt-001',
  name: 'Hgb Reagent',
  lotNumber: 'LOT-A',
  openDate: '2026-08-01',
  expiryDate: '2026-10-01',
  expectedTests: 100,
  testsPerformed: 40,
  costPerUnit: 1000,
  status: 'ACTIVE',
  remainingAtDisposal: null,
  disposalDate: null,
  disposalReason: null,
}

describe('WasteDashboardView — expiry-alerts error state', () => {
  beforeEach(() => {
    mockGetAllReagents.mockReset()
    mockGetActiveReagents.mockReset()
    mockGetConsumptionLog.mockReset()
  })

  it('shows expiry-alerts-unavailable when the consumption log fetch throws', async () => {
    // Outer load succeeds
    mockGetAllReagents.mockResolvedValue([activeReagent])
    mockGetActiveReagents.mockResolvedValue([activeReagent])
    // The nested expiry-alert loop throws on the first reagent
    mockGetConsumptionLog.mockRejectedValue(new Error('IndexedDB unavailable'))

    render(<WasteDashboardView />)

    await waitFor(() => {
      expect(screen.getByTestId('expiry-alerts-unavailable')).toBeInTheDocument()
    })

    // Must NOT show a "no expiry alerts" empty-state (which would be a false negative)
    expect(screen.queryByText('No expiry alerts')).not.toBeInTheDocument()
    expect(screen.queryByText('expiryAlertsHeading')).not.toBeInTheDocument()
  })

  it('does NOT show expiry-alerts-unavailable when load succeeds with no alerts', async () => {
    // Both outer and inner loads succeed; no reagents project early expiry
    mockGetAllReagents.mockResolvedValue([activeReagent])
    mockGetActiveReagents.mockResolvedValue([activeReagent])
    mockGetConsumptionLog.mockResolvedValue([])

    render(<WasteDashboardView />)

    await waitFor(() => {
      // Loading spinner gone — component is rendered
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    })

    expect(screen.queryByTestId('expiry-alerts-unavailable')).not.toBeInTheDocument()
  })
})
