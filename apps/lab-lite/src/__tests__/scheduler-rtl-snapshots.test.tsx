import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock next-intl
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, params?: Record<string, string | number>) => {
      const value = `${namespace}.${key}`
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          value,
        )
      }
      return value
    }
  },
  useLocale: () => 'ar',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  getPowerSchedules: vi.fn().mockResolvedValue([]),
  putPowerSchedule: vi.fn().mockResolvedValue(1),
  deletePowerSchedule: vi.fn().mockResolvedValue(undefined),
  getTestTimeEstimates: vi.fn().mockResolvedValue([
    { loincCode: '58410-2', displayName: 'CBC', estimatedMinutes: 15, requiresPower: true, batchSize: 20, updatedAt: '' },
    { loincCode: '24356-8', displayName: 'Urinalysis', estimatedMinutes: 5, requiresPower: false, batchSize: 1, updatedAt: '' },
  ]),
  putTestTimeEstimate: vi.fn().mockResolvedValue(undefined),
  resetTestTimeEstimates: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Mock useWorkloadSchedule hook
// ---------------------------------------------------------------------------

const mockScheduleData = {
  schedule: {
    scheduledGroups: [
      {
        loincCode: '58410-2',
        displayName: 'CBC',
        testCount: 5,
        estimatedMinutes: 15,
        phase: 'power' as const,
        hasUrgent: false,
      },
      {
        loincCode: '24356-8',
        displayName: 'Urinalysis',
        testCount: 2,
        estimatedMinutes: 5,
        phase: 'manual' as const,
        hasUrgent: false,
      },
    ],
    budget: { total: 240, used: 15, remaining: 225 },
    warnings: [],
  },
  budget: {
    startTime: '09:00',
    endTime: '13:00',
    totalMinutes: 240,
    remainingMinutes: 240,
  },
  warnings: [],
  timeWarnings: [],
  isLoading: false,
  hasSchedule: true,
  refresh: vi.fn(),
}

vi.mock('@/hooks/useWorkloadSchedule', () => ({
  useWorkloadSchedule: () => mockScheduleData,
}))

// ---------------------------------------------------------------------------
// Import components after mocks are established
// ---------------------------------------------------------------------------

import { WorkloadScheduleCard } from '@/components/scheduler/WorkloadScheduleCard'
import { PowerScheduleForm } from '@/components/scheduler/PowerScheduleForm'
import { TestTimeConfigPanel } from '@/components/scheduler/TestTimeConfigPanel'

afterEach(() => {
  document.dir = 'ltr'
})

// ---------------------------------------------------------------------------
// WorkloadScheduleCard RTL snapshots
// ---------------------------------------------------------------------------

describe('WorkloadScheduleCard RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(<WorkloadScheduleCard />)
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(<WorkloadScheduleCard />)
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// PowerScheduleForm RTL snapshots
// ---------------------------------------------------------------------------

describe('PowerScheduleForm RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(<PowerScheduleForm />)
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(<PowerScheduleForm />)
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// TestTimeConfigPanel RTL snapshots
// ---------------------------------------------------------------------------

describe('TestTimeConfigPanel RTL snapshots', () => {
  it('renders in LTR', () => {
    document.dir = 'ltr'
    const { container } = render(<TestTimeConfigPanel />)
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL', () => {
    document.dir = 'rtl'
    const { container } = render(<TestTimeConfigPanel />)
    expect(container).toMatchSnapshot()
  })
})
