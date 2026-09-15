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

  it('renders the resolved app name "sourceApp.PHARMACY_LITE" in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />,
    )

    // Wait for listNotifications to resolve and the row to appear
    await waitFor(() => {
      expect(screen.getByTestId('notif-row')).toBeInTheDocument()
    })

    // The useTranslations mock returns the key string, so sourceAppNameKey('PHARMACY_LITE')
    // = 'sourceApp.PHARMACY_LITE' and tNotif('sourceApp.PHARMACY_LITE') = 'sourceApp.PHARMACY_LITE'
    expect(screen.getByTestId('notif-app-name')).toHaveTextContent('sourceApp.PHARMACY_LITE')
  })

  it('renders the resolved subject key in the notification row', async () => {
    const { NotificationPanel } = await import('@/components/notifications/NotificationPanel')
    render(
      <NotificationPanel onClose={vi.fn()} onChange={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('notif-subject')).toBeInTheDocument()
    })

    // subject key = 'subject.PRESCRIPTION_DISPENSED'
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
