/**
 * ReadinessBriefingCard Component Tests — Story 48.3 Task 7
 *
 * Tests:
 *  - Renders loading skeleton
 *  - Renders all 5 dimensions with RAG badges
 *  - Expands dimension row on click to show recommendations
 *  - Refresh button triggers re-evaluation
 *  - RTL snapshot
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ReadinessBriefing } from '../lib/readiness-engine'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number | Date>) => {
    // Return key with params interpolated for test assertions (skip empty objects)
    if (params && Object.keys(params).length > 0) {
      return `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})`
    }
    return key
  },
}))

vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Users: () => <svg data-testid="icon-users" />,
  FlaskConical: () => <svg data-testid="icon-flask" />,
  Microscope: () => <svg data-testid="icon-microscope" />,
  ClipboardList: () => <svg data-testid="icon-clipboard" />,
  Zap: () => <svg data-testid="icon-zap" />,
  RefreshCw: ({ className }: { className?: string }) => <svg data-testid="icon-refresh" className={className} />,
  ChevronRight: () => <svg data-testid="icon-chevron-right" />,
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
  AlertTriangle: () => <svg data-testid="icon-alert" />,
}))

const mockRefresh = vi.fn()
let mockBriefing: ReadinessBriefing | null = null
let mockIsLoading = false

vi.mock('../hooks/useReadinessBriefing', () => ({
  useReadinessBriefing: () => ({
    briefing: mockBriefing,
    isLoading: mockIsLoading,
    refresh: mockRefresh,
    lastRefreshedAt: mockBriefing ? new Date('2026-01-01T07:30:00') : null,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import React from 'react'
import { ReadinessBriefingCard } from '../components/dashboard/ReadinessBriefingCard'

function makeBriefing(overrides: Partial<ReadinessBriefing> = {}): ReadinessBriefing {
  return {
    overallStatus: 'amber',
    generatedAt: '2026-01-01T07:30:00.000Z',
    refreshable: true,
    dimensions: [
      {
        dimension: 'personnel',
        status: 'amber',
        titleKey: 'readiness.dimensions.personnel.title',
        summaryKey: 'readiness.dimensions.personnel.summaryLoggedIn',
        details: ['readiness.dimensions.personnel.detailNoRoster'],
        recommendations: ['readiness.recommendations.personnelAmber'],
        recommendationArgs: [{}],
      },
      {
        dimension: 'reagents',
        status: 'green',
        titleKey: 'readiness.dimensions.reagents.title',
        summaryKey: 'readiness.dimensions.reagents.summaryAllGood',
        summaryArgs: { good: 3, total: 3 },
        details: [],
        recommendations: [],
      },
      {
        dimension: 'equipment',
        status: 'amber',
        titleKey: 'readiness.dimensions.equipment.title',
        summaryKey: 'readiness.dimensions.equipment.summaryNotConfigured',
        details: ['readiness.dimensions.equipment.detailNotConfigured'],
        recommendations: ['readiness.recommendations.equipmentAmber'],
        recommendationArgs: [{}],
      },
      {
        dimension: 'pendingOrders',
        status: 'green',
        titleKey: 'readiness.dimensions.pendingOrders.title',
        summaryKey: 'readiness.dimensions.pendingOrders.summaryNone',
        details: [],
        recommendations: [],
      },
      {
        dimension: 'power',
        status: 'green',
        titleKey: 'readiness.dimensions.power.title',
        summaryKey: 'readiness.dimensions.power.summaryUpcoming',
        summaryArgs: { startTime: '18:00', endTime: '22:00', totalMinutes: 240 },
        details: [],
        recommendations: [],
      },
    ],
    ...overrides,
  }
}

// Stub sessionStorage for tests
beforeEach(() => {
  mockRefresh.mockClear()
  mockBriefing = null
  mockIsLoading = false
  // Force auto-expand by setting sessionStorage to a past date
  globalThis.sessionStorage = {
    getItem: vi.fn(() => 'Mon Jan 01 2020'), // old date → triggers auto-expand
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReadinessBriefingCard', () => {
  it('renders loading skeleton when isLoading=true and no briefing', () => {
    mockIsLoading = true
    mockBriefing = null
    const { container } = render(<ReadinessBriefingCard />)
    // Skeleton: 5 animate-pulse divs
    const pulses = container.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
  })

  it('renders all 5 dimension titles when briefing is available', async () => {
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    await waitFor(() => {
      expect(screen.getByText('readiness.dimensions.personnel.title')).toBeDefined()
      expect(screen.getByText('readiness.dimensions.reagents.title')).toBeDefined()
      expect(screen.getByText('readiness.dimensions.equipment.title')).toBeDefined()
      expect(screen.getByText('readiness.dimensions.pendingOrders.title')).toBeDefined()
      expect(screen.getByText('readiness.dimensions.power.title')).toBeDefined()
    })
  })

  it('renders RAG badges for each dimension', async () => {
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    await waitFor(() => {
      // 2 amber badges (personnel + equipment) + 3 ready badges (reagents, orders, power)
      const cautionBadges = screen.getAllByText('readiness.status.caution')
      expect(cautionBadges.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows recommendations for amber/red dimensions when expanded', async () => {
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    await waitFor(() => {
      // Personnel dim has amber recommendation — shown because status != green
      expect(screen.getByText('readiness.recommendations.personnelAmber')).toBeDefined()
    })
  })

  it('calls refresh when refresh button is clicked', async () => {
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    const refreshBtn = screen.getByLabelText('readiness.refresh')
    fireEvent.click(refreshBtn)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows loading spinner on refresh button when isLoading=true', () => {
    mockIsLoading = true
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    const icon = screen.getByTestId('icon-refresh')
    expect(icon.getAttribute('class')).toContain('animate-spin')
  })

  it('shows timestamp footer when lastRefreshedAt is set', async () => {
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    await waitFor(() => {
      // The last evaluated key will appear (key with time param)
      const timeTexts = screen.getAllByText((text) => text.startsWith('readiness.lastEvaluated'))
      expect(timeTexts.length).toBeGreaterThan(0)
    })
  })

  it('renders collapsed summary when card is collapsed', async () => {
    // Force collapsed state by setting sessionStorage to today's date
    globalThis.sessionStorage = {
      getItem: vi.fn(() => new Date().toDateString()),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
    mockBriefing = makeBriefing()
    render(<ReadinessBriefingCard />)
    await waitFor(() => {
      // Collapsed summary with "{ready} of {total} dimensions ready"
      const summaries = screen.getAllByText((text) => text.includes('readiness.collapsedSummary'))
      expect(summaries.length).toBeGreaterThan(0)
    })
  })

  it('renders overall RED card for all-red briefing', async () => {
    mockBriefing = makeBriefing({
      overallStatus: 'red',
      dimensions: [
        {
          dimension: 'personnel',
          status: 'red',
          titleKey: 'readiness.dimensions.personnel.title',
          summaryKey: 'readiness.dimensions.personnel.summaryNoUser',
          details: [],
          recommendations: ['readiness.recommendations.personnelRed'],
          recommendationArgs: [{}],
        },
        {
          dimension: 'reagents',
          status: 'red',
          titleKey: 'readiness.dimensions.reagents.title',
          summaryKey: 'readiness.dimensions.reagents.summaryIssues',
          summaryArgs: { good: 0, total: 2 },
          details: ['readiness.dimensions.reagents.detailExpired'],
          recommendations: ['readiness.recommendations.reagentsRed'],
          recommendationArgs: [{ reagentName: 'Chem', testType: 'CBC', supplierName: 'S' }],
        },
        {
          dimension: 'equipment',
          status: 'amber',
          titleKey: 'readiness.dimensions.equipment.title',
          summaryKey: 'readiness.dimensions.equipment.summaryNotConfigured',
          details: [],
          recommendations: [],
        },
        {
          dimension: 'pendingOrders',
          status: 'red',
          titleKey: 'readiness.dimensions.pendingOrders.title',
          summaryKey: 'readiness.dimensions.pendingOrders.summary',
          summaryArgs: { total: 3, urgent: 2 },
          details: ['readiness.dimensions.pendingOrders.detail'],
          recommendations: ['readiness.recommendations.ordersRed'],
          recommendationArgs: [{ urgentCount: 2 }],
        },
        {
          dimension: 'power',
          status: 'red',
          titleKey: 'readiness.dimensions.power.title',
          summaryKey: 'readiness.dimensions.power.summaryElapsed',
          summaryArgs: { startTime: '06:00', endTime: '10:00' },
          details: ['readiness.dimensions.power.detailElapsed'],
          recommendations: ['readiness.recommendations.powerRed'],
          recommendationArgs: [{}],
        },
      ],
    })
    const { container } = render(<ReadinessBriefingCard />)
    await waitFor(() => {
      // Card should have red border classes
      const card = container.firstElementChild
      expect(card?.className).toContain('border-red')
    })
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot
// ---------------------------------------------------------------------------

describe('ReadinessBriefingCard RTL snapshot', () => {
  it('renders correctly in RTL direction', async () => {
    mockBriefing = makeBriefing()
    const { container } = render(
      <div dir="rtl">
        <ReadinessBriefingCard />
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText('readiness.dimensions.personnel.title')).toBeDefined()
    })
    expect(container).toMatchSnapshot()
  })
})
