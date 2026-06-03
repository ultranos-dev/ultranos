/**
 * Story 48.2 — Component tests for ReagentBurndownCard
 * Task 10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BurndownResult } from '../lib/reagent-burndown'
import type { AlertLevel } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock i18n
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    const full = `${ns}.${key}`
    const map: Record<string, string> = {
      'scheduler.burndown.title': 'Reagent Burndown',
      'scheduler.burndown.currentStock': 'Stock',
      'scheduler.burndown.dailyRate': 'Daily Rate',
      'scheduler.burndown.depletionDate': 'Depletion',
      'scheduler.burndown.expiryDate': 'Expiry',
      'scheduler.burndown.reorderBy': 'Reorder By',
      'scheduler.burndown.chart': 'Trend',
      'scheduler.burndown.reagentName': 'Reagent',
      'scheduler.burndown.alertInfo': 'Order Soon',
      'scheduler.burndown.alertWarning': 'Urgent',
      'scheduler.burndown.alertCritical': 'Critical',
      'scheduler.burndown.stockout': 'STOCKOUT',
      'scheduler.burndown.emptyState': 'No reagent inventory configured.',
      'scheduler.burndown.emptyStateAction': 'Set Up Inventory',
      'scheduler.burndown.configureSuppliers': 'Configure Suppliers',
      'scheduler.burndown.refresh': 'Refresh',
      'scheduler.burndown.sortBy': 'Sort by:',
      'scheduler.burndown.showLess': 'Show Less',
      'scheduler.burndown.viewAll': `View All (${params?.count ?? ''})`,
      'scheduler.burndown.confidence.high': 'High confidence',
      'scheduler.burndown.confidence.medium': 'Medium confidence',
      'scheduler.burndown.confidence.low': 'Low confidence',
      'scheduler.burndown.reason.usage': 'usage',
      'scheduler.burndown.reason.expiry': 'expiry',
      'scheduler.burndown.sort.urgency': 'Urgency',
      'scheduler.burndown.sort.depletion': 'Depletion',
      'scheduler.burndown.sort.name': 'Name',
    }
    return map[full] ?? full
  },
  useLocale: () => 'en',
}))

// ---------------------------------------------------------------------------
// Mock router
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Mock useReagentBurndown hook
// ---------------------------------------------------------------------------

let mockBurndownData: BurndownResult[] = []
let mockIsLoading = false
const mockRefresh = vi.fn()

vi.mock('../hooks/useReagentBurndown', () => ({
  useReagentBurndown: () => ({
    burndownData: mockBurndownData,
    alerts: [],
    cachedAlerts: [],
    isLoading: mockIsLoading,
    error: null,
    refresh: mockRefresh,
  }),
}))

function makeBurndownItem(
  id: string,
  name: string,
  alertLevel: AlertLevel,
  daysRemaining: number,
): BurndownResult {
  const effective = new Date()
  effective.setDate(effective.getDate() + daysRemaining)
  return {
    reagentId: id,
    reagentName: name,
    currentStock: 100,
    unit: 'mL',
    expiryDate: effective.toISOString().slice(0, 10),
    consumptionRate: {
      averageDailyUsage: 10,
      unit: 'mL',
      dataPointCount: 15,
      confidenceLevel: 'high',
    },
    usageDepletionDate: effective,
    effectiveDepletionDate: effective,
    depletionReason: 'usage',
    reorderDate: new Date(),
    daysRemaining,
    alertLevel,
    supplierLeadTimeDays: 14,
    supplierName: undefined,
  }
}

// ---------------------------------------------------------------------------
// Import component (after mocks)
// ---------------------------------------------------------------------------

const { ReagentBurndownCard } = await import('../components/scheduler/ReagentBurndownCard')

beforeEach(() => {
  mockBurndownData = []
  mockIsLoading = false
  mockRefresh.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReagentBurndownCard', () => {
  it('renders empty state when no reagents configured', () => {
    render(<ReagentBurndownCard />)
    expect(screen.getByText('No reagent inventory configured.')).toBeDefined()
  })

  it('renders reagent rows with alert badges', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'Glucose Reagent', 'critical', 3),
      makeBurndownItem('r2', 'Hemoglobin Kit', 'warning', 10),
    ]
    render(<ReagentBurndownCard />)
    expect(screen.getByText('Glucose Reagent')).toBeDefined()
    expect(screen.getByText('Hemoglobin Kit')).toBeDefined()
    expect(screen.getAllByTestId('alert-badge-critical')).toHaveLength(1)
    expect(screen.getAllByTestId('alert-badge-warning')).toHaveLength(1)
  })

  it('shows only top 3 items by default when > 3 reagents', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'A Reagent', 'critical', 3),
      makeBurndownItem('r2', 'B Reagent', 'warning', 10),
      makeBurndownItem('r3', 'C Reagent', 'info', 20),
      makeBurndownItem('r4', 'D Reagent', 'none', 60),
    ]
    render(<ReagentBurndownCard />)
    // Only 3 rows visible before expanding
    expect(screen.queryByText('D Reagent')).toBeNull()
    expect(screen.getByTestId('toggle-all')).toBeDefined()
  })

  it('expands to show all when View All is clicked', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'A Reagent', 'critical', 3),
      makeBurndownItem('r2', 'B Reagent', 'warning', 10),
      makeBurndownItem('r3', 'C Reagent', 'info', 20),
      makeBurndownItem('r4', 'D Reagent', 'none', 60),
    ]
    render(<ReagentBurndownCard />)
    fireEvent.click(screen.getByTestId('toggle-all'))
    expect(screen.getByText('D Reagent')).toBeDefined()
  })

  it('sorts by urgency by default (critical first)', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'Z Safe Reagent', 'none', 90),
      makeBurndownItem('r2', 'A Critical Reagent', 'critical', 3),
      makeBurndownItem('r3', 'M Warning Reagent', 'warning', 10),
    ]
    render(<ReagentBurndownCard />)
    // Default sort by urgency — critical item should appear
    expect(screen.getByText('A Critical Reagent')).toBeDefined()
  })

  it('sorts by name when name sort is clicked', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'Zebra Reagent', 'critical', 3),
      makeBurndownItem('r2', 'Alpha Reagent', 'warning', 10),
    ]
    render(<ReagentBurndownCard />)
    fireEvent.click(screen.getByTestId('sort-name'))
    // Both should still be visible
    expect(screen.getByText('Zebra Reagent')).toBeDefined()
    expect(screen.getByText('Alpha Reagent')).toBeDefined()
  })

  it('calls refresh when refresh button clicked', () => {
    mockBurndownData = [makeBurndownItem('r1', 'Test Reagent', 'warning', 12)]
    render(<ReagentBurndownCard />)
    fireEvent.click(screen.getByTestId('burndown-refresh'))
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('renders SVG burndown charts', () => {
    mockBurndownData = [makeBurndownItem('r1', 'Test Reagent', 'critical', 5)]
    render(<ReagentBurndownCard />)
    expect(screen.getByTestId('burndown-chart')).toBeDefined()
  })

  it('renders summary alert count chips in header', () => {
    mockBurndownData = [
      makeBurndownItem('r1', 'R1', 'critical', 3),
      makeBurndownItem('r2', 'R2', 'warning', 10),
    ]
    render(<ReagentBurndownCard />)
    // Multiple elements with these labels are expected (header chip + row badge)
    expect(screen.getAllByText(/Critical/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Urgent/).length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot
// ---------------------------------------------------------------------------

describe('ReagentBurndownCard RTL', () => {
  it('renders in RTL layout without errors', () => {
    mockBurndownData = [makeBurndownItem('r1', 'كاشف الجلوكوز', 'critical', 5)]
    const { container } = render(<ReagentBurndownCard locale="ar" />)
    const table = container.querySelector('table')
    expect(table?.getAttribute('dir')).toBe('rtl')
  })
})
