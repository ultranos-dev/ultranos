import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock i18n — returns the key with namespace prefix for easy assertion
const i18nMessages: Record<string, Record<string, string>> = {
  'scheduler.workload': {
    title: 'Workload Schedule',
    powerWindow: 'Power window: {startTime} – {endTime} ({hours}h)',
    noPowerSchedule: 'No power schedule set',
    budgetLabel: 'Power Budget',
    analyzerTimeNeeded: 'Analyzer time needed',
    available: 'Available',
    requiresPower: 'POWER',
    manual: 'MANUAL',
    overflow: 'Cannot complete in power window',
    urgent: 'URGENT',
    testCount: '{count} tests',
    estimatedTime: '~{minutes} min',
    refresh: 'Refresh',
    emptyState: 'No pending orders',
    configureLink: 'Configure',
    phaseHeaderPower: 'During Power Hours',
    phaseHeaderManual: 'Non-Power Hours (Manual)',
    phaseHeaderOverflow: 'Overflow — Cannot Complete',
  },
  'scheduler.powerSchedule': {
    setupPrompt: 'Set up your generator schedule to optimize test prioritization.',
    setupAction: 'Set Up Power Schedule',
  },
  scheduler: {
    'workload.title': 'Workload Schedule',
    'workload.powerWindow': 'Power window',
    'workload.emptyState': 'No pending orders',
    'workload.configureLink': 'Configure',
    'workload.refresh': 'Refresh',
    'workload.analyzerTimeNeeded': 'Analyzer time needed',
    'workload.available': 'Available',
    'workload.phaseHeaderPower': 'During Power Hours',
    'workload.phaseHeaderManual': 'Non-Power Hours (Manual)',
    'workload.phaseHeaderOverflow': 'Overflow — Cannot Complete',
    'workload.requiresPower': 'POWER',
    'workload.manual': 'MANUAL',
    'workload.overflow': 'Cannot complete in power window',
    'workload.urgent': 'URGENT',
    'workload.testCount': '{count} tests',
    'workload.estimatedTime': '~{minutes} min',
    'powerSchedule.setupPrompt': 'Set up your generator schedule.',
    'powerSchedule.setupAction': 'Set Up Power Schedule',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, params?: Record<string, string | number>) => {
      const ns = namespace || ''
      const value = i18nMessages[ns]?.[key] ?? `${ns}.${key}`
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          value,
        )
      }
      return value
    }
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock the useWorkloadSchedule hook
const mockUseWorkloadSchedule = vi.fn()
vi.mock('@/hooks/useWorkloadSchedule', () => ({
  useWorkloadSchedule: () => mockUseWorkloadSchedule(),
}))

import { WorkloadScheduleCard } from '@/components/scheduler/WorkloadScheduleCard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorkloadScheduleCard', () => {
  it('shows setup prompt when no power schedule is configured', () => {
    mockUseWorkloadSchedule.mockReturnValue({
      schedule: null,
      budget: null,
      warnings: [],
      timeWarnings: [],
      isLoading: false,
      hasSchedule: false,
      refresh: vi.fn(),
    })

    render(<WorkloadScheduleCard />)
    expect(screen.getByText('Set up your generator schedule.')).toBeTruthy()
    expect(screen.getByText('Set Up Power Schedule')).toBeTruthy()
  })

  it('shows empty state when no pending orders', () => {
    mockUseWorkloadSchedule.mockReturnValue({
      schedule: {
        scheduledGroups: [],
        budget: { total: 240, used: 0, remaining: 240 },
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
    })

    render(<WorkloadScheduleCard />)
    expect(screen.getByText('No pending orders')).toBeTruthy()
  })

  it('displays power window times', () => {
    mockUseWorkloadSchedule.mockReturnValue({
      schedule: {
        scheduledGroups: [
          {
            loincCode: '58410-2',
            displayName: 'CBC',
            testCount: 5,
            estimatedMinutes: 15,
            phase: 'power',
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
    })

    render(<WorkloadScheduleCard />)
    expect(screen.getByText(/Power window/)).toBeTruthy()
    expect(screen.getByText('During Power Hours')).toBeTruthy()
  })

  it('renders warning when budget exceeded', () => {
    mockUseWorkloadSchedule.mockReturnValue({
      schedule: {
        scheduledGroups: [
          {
            loincCode: '58410-2',
            displayName: 'CBC',
            testCount: 5,
            estimatedMinutes: 15,
            phase: 'power',
            hasUrgent: false,
          },
          {
            loincCode: '3016-3',
            displayName: 'TSH',
            testCount: 3,
            estimatedMinutes: 50,
            phase: 'overflow',
            hasUrgent: false,
          },
        ],
        budget: { total: 30, used: 15, remaining: 15 },
        warnings: [
          { message: 'Budget exceeded warning text', severity: 'red' as const },
        ],
      },
      budget: {
        startTime: '09:00',
        endTime: '09:30',
        totalMinutes: 30,
        remainingMinutes: 30,
      },
      warnings: [
        { message: 'Budget exceeded warning text', severity: 'red' as const },
      ],
      timeWarnings: [],
      isLoading: false,
      hasSchedule: true,
      refresh: vi.fn(),
    })

    render(<WorkloadScheduleCard />)
    expect(screen.getByText('Budget exceeded warning text')).toBeTruthy()
    expect(screen.getByText('Overflow — Cannot Complete')).toBeTruthy()
  })

  it('renders loading skeleton when loading', () => {
    mockUseWorkloadSchedule.mockReturnValue({
      schedule: null,
      budget: null,
      warnings: [],
      timeWarnings: [],
      isLoading: true,
      hasSchedule: true,
      refresh: vi.fn(),
    })

    const { container } = render(<WorkloadScheduleCard />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
