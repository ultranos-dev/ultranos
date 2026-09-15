/**
 * Task 10 — Notification Presentation Enrichment (Pharmacy Lite)
 *
 * Verifies that NotificationPanel resolves descriptor fields from a
 * PharmacyNotification and renders the enriched NotificationRow UI:
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
// sourceApp.* keys resolve to app names; time.* keys resolve to time strings;
// field.* keys resolve to label strings; other keys fall back to the bare key string.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const fullKey = `${namespace}.${key}`
    const MAP: Record<string, string> = {
      'notifications.sourceApp.PHARMACY_LITE': 'Pharmacy Lite',
      'notifications.sourceApp.LAB_LITE': 'Lab Lite',
      'notifications.sourceApp.OPD_LITE': 'OPD Lite',
      'notifications.sourceApp.SYSTEM': 'System',
      'notifications.field.reviewId': 'Review ID',
      'notifications.field.prescription': 'Prescription',
      'notifications.field.status': 'Status',
      'notifications.field.received': 'Received',
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

// auth-session-store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isAuthenticated: true, session: null }),
    {
      getState: () => ({
        getAccessToken: vi.fn().mockResolvedValue('pharm-token'),
      }),
    },
  ),
}))

// ui-kit barrel (formatDate, formatDateTime)
vi.mock('@ultranos/ui-kit', () => ({
  formatDate: (_d: Date, _locale: string) => '15 Sep 2026',
  formatDateTime: (_d: Date, _locale: string) => '15 Sep 2026, 10:30',
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
    details,
  }: {
    open: boolean
    onOpenChange: (o: boolean) => void
    appName: string
    details?: Array<{ label: string; value: string; emphasis?: boolean }>
  }) =>
    open ? (
      <div role="dialog" aria-label={`detail-${appName}`} data-testid="notif-modal">
        <span data-testid="modal-app-name">{appName}</span>
        {details?.map((d, i) => (
          <div key={i} data-testid="modal-detail-row">
            <span data-testid="modal-detail-label">{d.label}</span>
            <span data-testid="modal-detail-value">{d.value}</span>
          </div>
        ))}
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
      PRESCRIPTION_DISPENSED: 'PHARMACY_LITE',
      DISPENSE_REVIEW_RESOLVED: 'PHARMACY_LITE',
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
const mockGetUnreadNotificationCount = vi.fn().mockResolvedValue(0)

vi.mock('@/lib/trpc', () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  getUnreadNotificationCount: (...args: unknown[]) => mockGetUnreadNotificationCount(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────

const REVIEW_RESOLVED_NOTIFICATION = {
  id: 'n2',
  type: 'DISPENSE_REVIEW_RESOLVED',
  payload: {
    reviewId: 'review-uuid-abc-123456',
    prescriptionId: 'rx-uuid-def-789012',
    status: 'APPROVED',
    acknowledgedAt: '2026-09-15T10:30:00.000Z',
  },
  status: 'SENT',
  createdAt: '2026-09-15T10:28:00.000Z',
  deliveredAt: null,
  acknowledgedAt: null,
  sourceApp: 'PHARMACY_LITE',
  subjectKey: 'DISPENSE_REVIEW_RESOLVED',
  bodyKey: 'dispenseReviewBody',
  bodyParams: { status: 'APPROVED' },
  notesKey: null,
}

// ── Tests ──────────────────────────────────────────────────────────────────

const DISPENSED_NOTIFICATION = {
  id: 'n1',
  type: 'PRESCRIPTION_DISPENSED',
  payload: {},
  status: 'SENT',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), // 5 min ago
  deliveredAt: null,
  acknowledgedAt: null,
  sourceApp: 'PHARMACY_LITE',
  subjectKey: 'PRESCRIPTION_DISPENSED',
  bodyKey: null,
  bodyParams: undefined,
  notesKey: null,
}

describe('NotificationPanel — descriptor-field rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListNotifications.mockResolvedValue([DISPENSED_NOTIFICATION])
    mockAcknowledgeNotification.mockResolvedValue(undefined)
    mockGetUnreadNotificationCount.mockResolvedValue(1)
  })

  it('renders the resolved app name "Pharmacy Lite" in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />,
    )

    // Wait for listNotifications to resolve and the row to appear
    await waitFor(() => {
      expect(screen.getByTestId('notif-row')).toBeInTheDocument()
    })

    // The useTranslations mock resolves sourceApp.PHARMACY_LITE → 'Pharmacy Lite'
    expect(screen.getByTestId('notif-app-name')).toHaveTextContent('Pharmacy Lite')
  })

  it('renders the resolved subject key in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('notif-subject')).toBeInTheDocument()
    })

    // subject key = 'subject.PRESCRIPTION_DISPENSED' — mock returns the key (no dedicated translation)
    expect(screen.getByTestId('notif-subject')).toHaveTextContent('subject.PRESCRIPTION_DISPENSED')
  })

  it('clicking a row opens the detail dialog (role="dialog" present)', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('notif-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('notif-row'))

    // The detail modal should now be open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})

describe('NotificationPanel — DISPENSE_REVIEW_RESOLVED detail rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListNotifications.mockResolvedValue([REVIEW_RESOLVED_NOTIFICATION])
    mockAcknowledgeNotification.mockResolvedValue(undefined)
    mockGetUnreadNotificationCount.mockResolvedValue(1)
  })

  it('modal shows Review ID short form (last 6 chars uppercased)', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(<NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('notif-row')).toBeInTheDocument())
    await user.click(screen.getByTestId('notif-row'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // reviewId 'review-uuid-abc-123456' → last 6 → '123456' → '123456'
    const values = screen.getAllByTestId('modal-detail-value').map(el => el.textContent ?? '')
    expect(values.some(v => v.includes('123456'))).toBe(true)
  })

  it('modal shows Status row from bodyParams.status', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(<NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('notif-row')).toBeInTheDocument())
    await user.click(screen.getByTestId('notif-row'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const values = screen.getAllByTestId('modal-detail-value').map(el => el.textContent ?? '')
    expect(values.some(v => v === 'APPROVED')).toBe(true)
  })

  it('modal shows Received date-time row', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(<NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('notif-row')).toBeInTheDocument())
    await user.click(screen.getByTestId('notif-row'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // formatDateTime mock returns '15 Sep 2026, 10:30'
    const values = screen.getAllByTestId('modal-detail-value').map(el => el.textContent ?? '')
    expect(values.some(v => v === '15 Sep 2026, 10:30')).toBe(true)
  })

  it('modal does NOT show patient fields (pharmacy has no authorized patient path)', async () => {
    const user = userEvent.setup()
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(<NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('notif-row')).toBeInTheDocument())
    await user.click(screen.getByTestId('notif-row'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const labels = screen.getAllByTestId('modal-detail-label').map(el => el.textContent ?? '')
    expect(labels.every(l => !l.toLowerCase().includes('patient'))).toBe(true)
  })
})
