import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────

// next-intl — resolve keys to return bare key string for simple assertions
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const fullKey = `${namespace}.${key}`
    const MAP: Record<string, string> = {
      'time.justNow': 'Just now',
      'time.minutesAgo': `${params?.minutes ?? '{minutes}'}m ago`,
      'time.hoursAgo': `${params?.hours ?? '{hours}'}h ago`,
      'notifications.title': 'Notifications',
      'notifications.closeAria': 'Close notifications',
      'notifications.loading': 'Loading...',
      'notifications.loadError': 'Unable to load notifications. Check your connection.',
      'notifications.error': 'Unable to load notifications',
      'notifications.empty': 'No notifications',
      'notifications.unreadAriaLabel': 'Unread',
      'notifications.unreadMessage': `Unread: ${params?.message ?? '{message}'}`,
      'notifications.resultUploaded': 'Result uploaded',
      'notifications.resultAwaitingReview': 'Result awaiting review',
      'notifications.labStatusChanged': 'Lab status changed',
      'notifications.systemNotice': 'System notice',
      'notifications.resultUploadedMessage': `Result uploaded — ${params?.testCategory ?? '{testCategory}'}`,
      'notifications.resultEscalationMessage': `Result awaiting review — ${params?.testCategory ?? '{testCategory}'}`,
      'notifications.labStatusMessage': `Lab status: ${params?.status ?? '{status}'}`,
      'notifications.systemNotification': 'System notification',
      'notifications.unknownTest': 'Unknown test',
      'notifications.anomalyFlagMessage': `Anomaly flag — ${params?.ruleId ?? '{ruleId}'}`,
      'notifications.unread': 'Unread',
      'notifications.viewDetails': 'View Details',
      'notifications.sourceApp.LAB_LITE': 'Lab Lite',
      'notifications.sourceApp.PHARMACY_LITE': 'Pharmacy Lite',
      'notifications.sourceApp.OPD_LITE': 'OPD Lite',
      'notifications.sourceApp.SYSTEM': 'System',
    }
    return MAP[fullKey] ?? key
  },
}))

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  }),
}))

// data-budget-store
vi.mock('@/stores/data-budget-store', () => ({
  useDataBudgetStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ lowDataMode: false }),
}))

// auth-session-store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isAuthenticated: true, session: { practitionerId: 'tech-1' } }),
}))

// equipment-service
vi.mock('@/lib/equipment-service', () => ({
  getActiveInstrumentNotifications: vi.fn().mockResolvedValue([]),
}))

// next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

// ui-kit notification sub-paths used by the new NotificationPanel
vi.mock('@ultranos/ui-kit/components/ui/notification-row', () => ({
  NotificationRow: ({
    appName,
    subject,
    onClick,
  }: {
    appName: string
    subject: string
    onClick: () => void
  }) => (
    <button type="button" data-testid="notif-row" onClick={onClick}>
      <span>{appName}</span>
      <span>{subject}</span>
    </button>
  ),
}))

vi.mock('@ultranos/ui-kit/components/ui/notification-detail-modal', () => ({
  NotificationDetailModal: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (o: boolean) => void
  }) =>
    open ? (
      <div role="dialog" data-testid="notif-modal">
        <button type="button" onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@ultranos/ui-kit/notification-presentation', () => ({
  sourceAppIcon: () => () => null,
  sourceAppNameKey: (app: string) => `sourceApp.${app}`,
  deriveSourceApp: (type: string) => {
    const map: Record<string, string> = {
      LAB_RESULT_AVAILABLE: 'LAB_LITE',
      LAB_RESULT_ESCALATION: 'LAB_LITE',
    }
    return map[type] ?? 'SYSTEM'
  },
}))

vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}))

vi.mock('@ultranos/ui-kit', () => ({
  formatDate: (d: Date) => d.toLocaleDateString(),
}))

const mockGetUnreadCount = vi.fn()
const mockListNotifications = vi.fn()
const mockAcknowledgeNotification = vi.fn()

vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return {
    ...actual,
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
    listNotifications: (...args: unknown[]) => mockListNotifications(...args),
    acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  }
})

import { NotificationBell } from '../components/notifications/NotificationBell'
import { NotificationPanel } from '../components/notifications/NotificationPanel'
import { NotificationItemRow } from '../components/notifications/NotificationItem'
import type { NotificationItem } from '../lib/trpc'

// ── Fixtures ───────────────────────────────────────────────

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notif-1',
    type: 'LAB_RESULT_AVAILABLE',
    payload: {
      testCategory: 'Blood Work — CBC',
      labName: 'Central Lab',
      diagnosticReportId: 'report-1',
      uploadTimestamp: '2026-05-11T10:00:00Z',
    },
    status: 'SENT',
    createdAt: new Date().toISOString(),
    deliveredAt: new Date().toISOString(),
    acknowledgedAt: null,
    ...overrides,
  }
}

// ── Setup / Teardown ───────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockGetUnreadCount.mockResolvedValue(0)
  mockListNotifications.mockResolvedValue([])
  mockAcknowledgeNotification.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  cleanup()
})

// ── Test Suite ─────────────────────────────────────────────

describe('NotificationBell', () => {
  it('renders bell icon with correct unread count (AC #5)', async () => {
    mockGetUnreadCount.mockResolvedValue(3)
    render(<NotificationBell />)

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('3')
    })
    expect(screen.getByLabelText('Notifications (3 unread)')).toBeInTheDocument()
  })

  it('shows no badge when unread count is 0', async () => {
    mockGetUnreadCount.mockResolvedValue(0)
    render(<NotificationBell />)

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
  })

  it('caps badge display at 99+', async () => {
    mockGetUnreadCount.mockResolvedValue(150)
    render(<NotificationBell />)

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('99+')
    })
  })

  it('opens panel on bell click (AC #1)', async () => {
    mockGetUnreadCount.mockResolvedValue(1)
    mockListNotifications.mockResolvedValue([makeNotification()])
    render(<NotificationBell />)

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument()
  })

  it('polls every 30 seconds (AC #5)', async () => {
    mockGetUnreadCount.mockResolvedValue(0)
    render(<NotificationBell />)

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1)
    })

    // Advance 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(2)
    })

    // Advance another 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(3)
    })
  })
})

describe('NotificationPanel', () => {
  it('fetches and displays notifications as enriched rows (AC #1, #2)', async () => {
    const items = [
      makeNotification({ id: 'n1', type: 'LAB_RESULT_AVAILABLE', sourceApp: 'LAB_LITE', subjectKey: 'LAB_RESULT_AVAILABLE' }),
      makeNotification({ id: 'n2', type: 'LAB_RESULT_ESCALATION', sourceApp: 'LAB_LITE', subjectKey: 'LAB_RESULT_ESCALATION', payload: { testCategory: 'Urinalysis' } }),
    ]
    mockListNotifications.mockResolvedValue(items)

    const onClose = vi.fn()
    const onCountChange = vi.fn()
    render(<NotificationPanel onClose={onClose} onCountChange={onCountChange} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-row')).toHaveLength(2)
    })
  })

  it('shows empty state when no notifications', async () => {
    mockListNotifications.mockResolvedValue([])
    render(<NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument()
    })
  })

  it('shows error state when fetch fails (P2 review finding)', async () => {
    mockListNotifications.mockRejectedValue(new Error('Network error'))
    render(<NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('notification-error')).toBeInTheDocument()
      expect(screen.getByText(/Unable to load notifications/)).toBeInTheDocument()
    })
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument()
  })

  it('closes on Escape key (AC #6)', async () => {
    mockListNotifications.mockResolvedValue([])
    const onClose = vi.fn()
    render(<NotificationPanel onClose={onClose} onCountChange={vi.fn()} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on outside click (AC #6)', async () => {
    mockListNotifications.mockResolvedValue([])
    const onClose = vi.fn()

    // Render panel inside a wrapper to simulate the real DOM structure
    const { container } = render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <div className="relative">
          <NotificationPanel onClose={onClose} onCountChange={vi.fn()} />
        </div>
      </div>,
    )

    // Wait for the setTimeout(0) in the click-outside handler registration
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    fireEvent.mouseDown(container.querySelector('[data-testid="outside-element"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('NotificationItemRow', () => {
  it('renders unread notifications with bold text and dot indicator (AC #3)', () => {
    const notif = makeNotification({ status: 'SENT' })
    render(<NotificationItemRow notification={notif} onAcknowledge={vi.fn()} />)

    const item = screen.getByTestId('notification-item')
    expect(item).toHaveClass('bg-primary/10')
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument()

    const message = screen.getByText(/Result uploaded — Blood Work/)
    expect(message).toHaveClass('font-semibold')
  })

  it('renders read notifications without bold or dot (AC #3)', () => {
    const notif = makeNotification({ status: 'ACKNOWLEDGED' })
    render(<NotificationItemRow notification={notif} onAcknowledge={vi.fn()} />)

    const item = screen.getByTestId('notification-item')
    expect(item).not.toHaveClass('bg-primary/10')
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument()

    const message = screen.getByText(/Result uploaded — Blood Work/)
    expect(message).toHaveClass('font-normal')
  })

  it('renders correct icons/messages per notification type (AC #2)', () => {
    const types: Array<{ type: string; expectedText: RegExp }> = [
      { type: 'LAB_RESULT_AVAILABLE', expectedText: /Result uploaded/ },
      { type: 'LAB_RESULT_ESCALATION', expectedText: /Result awaiting review/ },
      { type: 'LAB_STATUS_CHANGE', expectedText: /Lab status/ },
      { type: 'SYSTEM_MAINTENANCE', expectedText: /System notification/ },
    ]

    for (const { type, expectedText } of types) {
      cleanup()
      const payload = type.startsWith('LAB_STATUS')
        ? { message: 'approved' }
        : type.startsWith('SYSTEM')
          ? { message: 'Scheduled downtime tonight' }
          : { testCategory: 'CBC' }
      render(
        <NotificationItemRow
          notification={makeNotification({ type, payload })}
          onAcknowledge={vi.fn()}
        />,
      )
      expect(screen.getByTestId('notification-item')).toBeInTheDocument()
      // For system type, the message comes from payload
      if (type === 'SYSTEM_MAINTENANCE') {
        expect(screen.getByText(/Scheduled downtime tonight/)).toBeInTheDocument()
      } else {
        expect(screen.getByText(expectedText)).toBeInTheDocument()
      }
    }
  })

  it('calls acknowledge on click for unread notification (AC #4)', () => {
    const onAcknowledge = vi.fn()
    const notif = makeNotification({ status: 'SENT' })
    render(<NotificationItemRow notification={notif} onAcknowledge={onAcknowledge} />)

    fireEvent.click(screen.getByTestId('notification-item'))
    expect(onAcknowledge).toHaveBeenCalledWith('notif-1')
  })

  it('does not call acknowledge on click for already-read notification', () => {
    const onAcknowledge = vi.fn()
    const notif = makeNotification({ status: 'ACKNOWLEDGED' })
    render(<NotificationItemRow notification={notif} onAcknowledge={onAcknowledge} />)

    fireEvent.click(screen.getByTestId('notification-item'))
    expect(onAcknowledge).not.toHaveBeenCalled()
  })
})
