import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'
import type { ThresholdLevel } from '@/lib/data-budget-calc'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Load messages
import messages from '../../messages/en.json'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}

// Dynamically import after mocks
let DataBudgetDashboard: any

describe('DataBudgetDashboard', () => {
  beforeEach(async () => {
    // Reset store state before each test
    useDataBudgetStore.setState({
      planSizeMB: 500,
      billingCycleDay: 1,
      lowDataMode: false,
      currentCycleUsedMB: 0,
      projectedExhaustionDate: null,
      dailyUsage: [],
      categoryBreakdown: {},
      thresholdLevel: 'normal' as ThresholdLevel,
      isLoaded: true,
    })

    const mod = await import('@/components/settings/DataBudgetDashboard')
    DataBudgetDashboard = mod.DataBudgetDashboard
  })

  it('renders usage gauge with correct percentage', () => {
    useDataBudgetStore.setState({
      currentCycleUsedMB: 250,
      planSizeMB: 500,
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    // Should show "250.0 / 500 MB"
    expect(screen.getByText(/250\.0 \/ 500 MB/)).toBeTruthy()

    // Progressbar should exist
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeTruthy()
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
  })

  it('renders projection when data is available', () => {
    useDataBudgetStore.setState({
      projectedExhaustionDate: '2026-06-15',
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    expect(screen.getByText(/2026-06-15/)).toBeTruthy()
  })

  it('shows no-data message when projection is null', () => {
    useDataBudgetStore.setState({
      projectedExhaustionDate: null,
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    expect(screen.getByText(/Not enough data/)).toBeTruthy()
  })

  it('shows warning banner at 75% threshold', () => {
    useDataBudgetStore.setState({
      thresholdLevel: 'warning' as ThresholdLevel,
      currentCycleUsedMB: 400,
      planSizeMB: 500,
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    const alert = screen.getByTestId('data-budget-warning')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain('Consider enabling Low Data Mode')
  })

  it('shows critical banner at 90% threshold', () => {
    useDataBudgetStore.setState({
      thresholdLevel: 'critical' as ThresholdLevel,
      currentCycleUsedMB: 475,
      planSizeMB: 500,
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    const alert = screen.getByTestId('data-budget-critical')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain('critically low')
  })

  it('does not show banners in normal threshold', () => {
    useDataBudgetStore.setState({
      thresholdLevel: 'normal' as ThresholdLevel,
      currentCycleUsedMB: 100,
      planSizeMB: 500,
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    expect(screen.queryByTestId('data-budget-warning')).toBeNull()
    expect(screen.queryByTestId('data-budget-critical')).toBeNull()
  })

  it('renders daily usage chart with bars', () => {
    useDataBudgetStore.setState({
      dailyUsage: [
        { date: '2026-05-28', totalMB: 5 },
        { date: '2026-05-29', totalMB: 10 },
        { date: '2026-05-30', totalMB: 3 },
      ],
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    // Should render the chart title
    expect(screen.getByText(/Daily Usage/)).toBeTruthy()
  })

  it('renders category breakdown table', () => {
    useDataBudgetStore.setState({
      categoryBreakdown: { upload: 10.5, audit: 3.2, notification: 1.1, other: 0.5 },
    })

    render(<DataBudgetDashboard />, { wrapper: Wrapper })

    expect(screen.getByText('Uploads')).toBeTruthy()
    expect(screen.getByText('Audit Sync')).toBeTruthy()
    expect(screen.getByText('10.50')).toBeTruthy()
  })
})
