/**
 * Task 11 — Notification Presentation Enrichment (Lab Lite)
 *
 * Verifies that NotificationPanel resolves descriptor fields from a
 * LabNotification and renders the enriched NotificationRow UI:
 *  - source-app name (via sourceAppNameKey resolver)
 *  - clicking a row opens the detail dialog
 *
 * TDD: write first, implement after.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ──────────────────────────────────────────────────────────────────

// next-intl — mock useTranslations to resolve keys to real English values
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const fullKey = `${namespace}.${key}`
    const MAP: Record<string, string> = {
      'notifications.sourceApp.LAB_LITE': 'Lab Lite',
      'notifications.sourceApp.PHARMACY_LITE': 'Pharmacy Lite',
      'notifications.sourceApp.OPD_LITE': 'OPD Lite',
      'notifications.sourceApp.SYSTEM': 'System',
      'notifications.subject.LAB_RESULT_AVAILABLE': 'Lab result available',
      'notifications.subject.LAB_RESULT_ESCALATION': 'Urgent lab result',
      'notifications.body.labResultBody': `${params?.testCategory ?? '{testCategory}'} · ${params?.labName ?? '{labName}'}`,
      'notifications.notes.labResultNotes': 'Review the result in the patient chart.',
      'notifications.notes.labResultUrgentNotes': 'This result requires urgent clinical attention.',
      'notifications.title': 'Notifications',
      'notifications.closeAria': 'Close notifications',
      'notifications.loading': 'Loading...',
      'notifications.error': 'Unable to load notifications',
      'notifications.empty': 'No notifications',
      'notifications.unread': 'Unread',
      'notifications.viewDetails': 'View Details',
      'time.justNow': 'Just now',
      'time.minutesAgo': `${params?.minutes ?? '{minutes}'}m ago`,
      'time.hoursAgo': `${params?.hours ?? '{hours}'}h ago`,
    }
    return MAP[fullKey] ?? key
  },
}))

// next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

// supabase client
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  }),
}))

// auth-session-store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isAuthenticated: true, session: null }),
    {
      getState: () => ({
        session: null,
      }),
    },
  ),
}))

// data-budget-store
vi.mock('@/stores/data-budget-store', () => ({
  useDataBudgetStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ lowDataMode: false }),
}))

// equipment-service
vi.mock('@/lib/equipment-service', () => ({
  getActiveInstrumentNotifications: vi.fn().mockResolvedValue([]),
}))

// ui-kit sub-paths used by NotificationPanel / NotificationBell
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
      <span data-testid="notif-app-name">{appName}</span>
      <span data-testid="notif-subject">{subject}</span>
    </button>
  ),
}))

vi.mock('@ultranos/ui-kit/components/ui/notification-detail-modal', () => ({
  NotificationDetailModal: ({
    open,
    onOpenChange,
    appName,
  }: {
    open: boolean
    onOpenChange: (o: boolean) => void
    appName: string
  }) =>
    open ? (
      <div role="dialog" aria-label={`detail-${appName}`} data-testid="notif-modal">
        <span data-testid="modal-app-name">{appName}</span>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
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
      LAB_STATUS_CHANGE: 'LAB_LITE',
      LAB_STATUS_APPROVED: 'LAB_LITE',
      LAB_STATUS_SUSPENDED: 'LAB_LITE',
    }
    return map[type] ?? 'SYSTEM'
  },
}))

vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}))

// Stub trpc functions — listNotifications returns a descriptor-bearing item
const mockListNotifications = vi.fn()
const mockAcknowledgeNotification = vi.fn().mockResolvedValue(undefined)
const mockGetUnreadCount = vi.fn().mockResolvedValue(0)

vi.mock('@/lib/trpc', () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
}))

// ── Tests ──────────────────────────────────────────────────────────────────

const LAB_RESULT_NOTIFICATION = {
  id: 'n1',
  type: 'LAB_RESULT_AVAILABLE',
  payload: { testCategory: 'CBC' },
  status: 'SENT',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), // 5 min ago
  deliveredAt: null,
  acknowledgedAt: null,
  sourceApp: 'LAB_LITE',
  subjectKey: 'LAB_RESULT_AVAILABLE',
  bodyKey: null,
  bodyParams: undefined,
  notesKey: null,
}

describe('NotificationPanel — descriptor-field rendering (Lab Lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListNotifications.mockResolvedValue([LAB_RESULT_NOTIFICATION])
    mockAcknowledgeNotification.mockResolvedValue(undefined)
    mockGetUnreadCount.mockResolvedValue(1)
  })

  it('renders the resolved app name "Lab Lite" in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />,
    )

    // Wait for listNotifications to resolve and the row to appear
    await waitFor(() => {
      expect(screen.getByTestId('notif-row')).toBeInTheDocument()
    })

    // The useTranslations mock resolves sourceApp.LAB_LITE → 'Lab Lite'
    expect(screen.getByTestId('notif-app-name')).toHaveTextContent('Lab Lite')
  })

  it('renders the resolved subject key in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('notif-subject')).toBeInTheDocument()
    })

    // subject key 'subject.LAB_RESULT_AVAILABLE' resolves to 'Lab result available'
    expect(screen.getByTestId('notif-subject')).toHaveTextContent('Lab result available')
  })

  it('clicking a row opens the detail dialog (role="dialog" present)', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('notif-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('notif-row'))

    // Both the panel (role="dialog") and the detail modal (role="dialog") appear.
    // Assert the modal specifically; also confirm it carries role="dialog" for a11y.
    await waitFor(() => {
      const modal = screen.getByTestId('notif-modal')
      expect(modal).toBeInTheDocument()
      expect(modal).toHaveAttribute('role', 'dialog')
    })
  })
})
