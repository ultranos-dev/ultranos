import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataBudgetDashboard } from '../components/settings/DataBudgetDashboard'

// Mock next-intl — returns the key so assertions are stable
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock @ultranos/ui-kit imports used by the component
vi.mock('@ultranos/ui-kit/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))
vi.mock('@ultranos/ui-kit/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}))
vi.mock('@ultranos/ui-kit/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@ultranos/ui-kit/components/ui/alert', () => ({
  Alert: ({
    children,
    variant,
    ...props
  }: { children?: React.ReactNode; variant?: string } & React.HTMLAttributes<HTMLDivElement>) => (
    <div data-variant={variant} {...props}>
      {children}
    </div>
  ),
}))
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title, size }: { title: string; size?: string }) => (
    <div data-testid="empty-state" data-size={size}>
      {title}
    </div>
  ),
}))
vi.mock('@ultranos/ui-kit/icons', () => ({
  Database: () => <svg data-testid="icon-database" />,
}))

// Base store shape — tests override individual fields
const baseStore = {
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleUsedMB: 0,
  projectedExhaustionDate: null,
  dailyUsage: [],
  categoryBreakdown: {},
  thresholdLevel: 'normal' as const,
  isLoaded: true,
  _loading: false,
  loadFromDexie: vi.fn().mockResolvedValue(undefined),
  updateConfig: vi.fn().mockResolvedValue(undefined),
  refreshUsageStats: vi.fn().mockResolvedValue(undefined),
}

const mockUseDataBudgetStore = vi.fn()

vi.mock('../stores/data-budget-store', () => ({
  useDataBudgetStore: (...args: unknown[]) => mockUseDataBudgetStore(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseDataBudgetStore.mockReturnValue(baseStore)
})

describe('DataBudgetDashboard — design-system tokens', () => {
  it('progress bar uses bg-success at normal threshold', () => {
    mockUseDataBudgetStore.mockReturnValue({ ...baseStore, thresholdLevel: 'normal' })
    const { container } = render(<DataBudgetDashboard />)
    // The progressbar parent has aria-hidden="true" so we query by attribute directly
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar).not.toBeNull()
    expect(bar.className).toContain('bg-success')
    expect(bar.className).not.toContain('bg-green-500')
  })

  it('progress bar uses bg-warning at warning threshold', () => {
    mockUseDataBudgetStore.mockReturnValue({
      ...baseStore,
      thresholdLevel: 'warning',
      currentCycleUsedMB: 400,
    })
    const { container } = render(<DataBudgetDashboard />)
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar).not.toBeNull()
    expect(bar.className).toContain('bg-warning')
    expect(bar.className).not.toContain('bg-yellow-500')
  })

  it('progress bar uses bg-destructive at critical threshold', () => {
    mockUseDataBudgetStore.mockReturnValue({
      ...baseStore,
      thresholdLevel: 'critical',
      currentCycleUsedMB: 490,
    })
    const { container } = render(<DataBudgetDashboard />)
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar).not.toBeNull()
    expect(bar.className).toContain('bg-destructive')
    expect(bar.className).not.toContain('bg-red-500')
  })

  it('renders warning Alert with variant="warning" when thresholdLevel is warning', () => {
    mockUseDataBudgetStore.mockReturnValue({ ...baseStore, thresholdLevel: 'warning' })
    render(<DataBudgetDashboard />)
    const alertEl = screen.getByTestId('data-budget-warning')
    expect(alertEl).toBeDefined()
    expect(alertEl.getAttribute('data-variant')).toBe('warning')
    // ensure no raw hardcoded Tailwind color classes from old implementation
    expect(alertEl.className).not.toContain('bg-yellow-50')
  })

  it('renders critical Alert with variant="destructive" when thresholdLevel is critical', () => {
    mockUseDataBudgetStore.mockReturnValue({ ...baseStore, thresholdLevel: 'critical' })
    render(<DataBudgetDashboard />)
    const alertEl = screen.getByTestId('data-budget-critical')
    expect(alertEl).toBeDefined()
    expect(alertEl.getAttribute('data-variant')).toBe('destructive')
    expect(alertEl.className).not.toContain('bg-red-50')
  })

  it('renders EmptyState when categoryBreakdown is empty', () => {
    mockUseDataBudgetStore.mockReturnValue({ ...baseStore, categoryBreakdown: {} })
    render(<DataBudgetDashboard />)
    const empty = screen.getByTestId('empty-state')
    expect(empty).toBeDefined()
    // Empty state is now the centered (md) variant inside a flex centering wrapper
    expect(empty.getAttribute('data-size')).not.toBe('sm')
    expect(empty.parentElement?.className).toContain('items-center')
    expect(empty.parentElement?.className).toContain('justify-center')
    // i18n mock returns the key itself
    expect(empty.textContent).toBe('categoryEmpty')
  })

  it('renders category table when categoryBreakdown has entries', () => {
    mockUseDataBudgetStore.mockReturnValue({
      ...baseStore,
      categoryBreakdown: { upload: 12.5, audit: 3.2 },
    })
    render(<DataBudgetDashboard />)
    expect(screen.queryByTestId('empty-state')).toBeNull()
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('no warning or critical banner when threshold is normal', () => {
    mockUseDataBudgetStore.mockReturnValue({ ...baseStore, thresholdLevel: 'normal' })
    render(<DataBudgetDashboard />)
    expect(screen.queryByTestId('data-budget-warning')).toBeNull()
    expect(screen.queryByTestId('data-budget-critical')).toBeNull()
  })
})
