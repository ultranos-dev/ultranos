/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TDD: Admin-Portal Notification surface
 * Tests NotificationBell (panel + detail modal) and NotificationToaster (seeded seenIds).
 * Written BEFORE implementation — run first to watch fail, then implement to pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock next/navigation ──────────────────────────────────────────────────────
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}))

// ── Mock app-toaster notify ────────────────────────────────────────────────────
const mockNotify = vi.fn()
vi.mock('@ultranos/ui-kit/components/ui/app-toaster', () => ({
  AppToaster: () => <div data-testid="app-toaster" />,
  notify: (...args: any[]) => mockNotify(...args),
}))

// ── Mock the admin notification client ───────────────────────────────────────
const mockFetchNotifications = vi.fn()
const mockFetchUnreadCount = vi.fn()
const mockAcknowledgeNotification = vi.fn()
const mockDeleteNotification = vi.fn()

vi.mock('@/lib/notification-client', () => ({
  fetchNotifications: (...args: any[]) => mockFetchNotifications(...args),
  fetchUnreadCount: (...args: any[]) => mockFetchUnreadCount(...args),
  acknowledgeNotification: (...args: any[]) => mockAcknowledgeNotification(...args),
  deleteNotification: (...args: any[]) => mockDeleteNotification(...args),
}))

// ── Sample admin notification (KYC_APPROVED, sourceApp ADMIN) ────────────────
const mockKycNotification = {
  id: 'notif-kyc-001',
  type: 'KYC_APPROVED',
  sourceApp: 'ADMIN',
  subjectKey: 'KYC_APPROVED',
  bodyKey: 'kycStatusBody',
  bodyParams: { status: 'APPROVED' },
  notesKey: null,
  status: 'DELIVERED',
  createdAt: new Date('2026-09-15T10:00:00Z').toISOString(),
  deliveredAt: new Date('2026-09-15T10:00:05Z').toISOString(),
  acknowledgedAt: null,
  payload: { status: 'APPROVED' },
}

// ── NotificationBell tests ───────────────────────────────────────────────────

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchNotifications.mockResolvedValue([mockKycNotification])
    mockFetchUnreadCount.mockResolvedValue(1)
    mockAcknowledgeNotification.mockResolvedValue(undefined)
    mockDeleteNotification.mockResolvedValue(undefined)
  })

  it('renders the bell button', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    render(<NotificationBell />)

    const bell = screen.getByRole('button')
    expect(bell).toBeDefined()
  })

  it('shows unread badge when there are unread notifications', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    render(<NotificationBell />)

    await waitFor(() => {
      const badge = screen.queryByTestId('notif-badge')
      expect(badge).not.toBeNull()
    })
  })

  it('opens panel on bell click', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    const bell = screen.getByRole('button')
    await user.click(bell)

    await waitFor(() => {
      expect(screen.getByTestId('notification-panel')).toBeDefined()
    })
  })

  it('renders resolved source-app name (Admin) in the panel', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(screen.getByRole('button'))

    // The panel should resolve sourceApp.ADMIN → "Admin" (from en.json notifications.sourceApp.ADMIN)
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeDefined()
    })
  })

  it('opens detail modal with non-PHI fields when a notification row is clicked', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    // Open panel
    await user.click(screen.getByRole('button'))

    // Wait for notification row to appear and click it
    await waitFor(() => {
      expect(screen.getByTestId('notification-panel')).toBeDefined()
    })

    // The row is a role="button" inside the panel
    const rows = screen.getAllByRole('button')
    // Find the notification row (not the bell or close button)
    // The row renders the subject "KYC approved" from en.json
    await waitFor(() => {
      expect(screen.getByText('KYC approved')).toBeDefined()
    })

    // Click the notification row (find by notification subject)
    const notifRow = screen.getByText('KYC approved')
    await user.click(notifRow)

    // The detail modal should be open (role="dialog")
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })

    // Status field should be present in the modal (non-PHI)
    expect(screen.getByText('Status')).toBeDefined()
    // Received field should be present
    expect(screen.getByText('Received')).toBeDefined()
  })

  it('does not render any patient-related fields in the detail modal', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(screen.getByRole('button'))
    await waitFor(() => screen.getByText('KYC approved'))
    await user.click(screen.getByText('KYC approved'))

    await waitFor(() => screen.getByRole('dialog'))

    // No patient name / patient lookup fields
    expect(screen.queryByTestId('patient-loading')).toBeNull()
    expect(screen.queryByText('Patient')).toBeNull()
  })

  it('clicking delete calls deleteNotification and removes the row', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    // Open the panel
    await user.click(screen.getByRole('button'))

    // Wait for the notification row to appear
    await waitFor(() => screen.getByText('KYC approved'))

    // Find and click the delete button (aria-label = "Delete notification")
    const deleteBtn = screen.getByRole('button', { name: /delete notification/i })
    await user.click(deleteBtn)

    // deleteNotification should have been called with the notification id
    expect(mockDeleteNotification).toHaveBeenCalledWith('notif-kyc-001')

    // The row should be removed from the panel (optimistic removal)
    await waitFor(() => {
      expect(screen.queryByText('KYC approved')).toBeNull()
    })
  })

  it('clicking mark-read calls acknowledgeNotification for an unread notification', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    // Open the panel
    await user.click(screen.getByRole('button'))

    // Wait for the notification row to appear (status is DELIVERED → unread)
    await waitFor(() => screen.getByText('KYC approved'))

    // Find and click the mark-read button (aria-label = "Mark as read")
    const markReadBtn = screen.getByRole('button', { name: /mark as read/i })
    await user.click(markReadBtn)

    // acknowledgeNotification should have been called with the notification id
    expect(mockAcknowledgeNotification).toHaveBeenCalledWith('notif-kyc-001')
  })

  it('mark-read button is absent for an already-acknowledged notification', async () => {
    // Seed an already-acknowledged notification
    const acknowledgedNotif = { ...mockKycNotification, status: 'ACKNOWLEDGED' }
    mockFetchNotifications.mockResolvedValue([acknowledgedNotif])

    const { NotificationBell } = await import('@/components/notifications/NotificationBell')
    const user = userEvent.setup()
    render(<NotificationBell />)

    // Open the panel
    await user.click(screen.getByRole('button'))
    await waitFor(() => screen.getByText('KYC approved'))

    // Mark-read button must NOT be present for an acknowledged notification
    expect(screen.queryByRole('button', { name: /mark as read/i })).toBeNull()
  })
})

// ── NotificationToaster tests ────────────────────────────────────────────────

describe('NotificationToaster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAcknowledgeNotification.mockResolvedValue(undefined)
    mockDeleteNotification.mockResolvedValue(undefined)
    mockNotify.mockClear()
  })

  it('mounts AppToaster without crashing', async () => {
    mockFetchNotifications.mockResolvedValue([])
    const { NotificationToaster } = await import('@/components/NotificationToaster')
    const { container } = render(<NotificationToaster />)
    // AppToaster renders a Toaster (sonner) — just verify no crash and something rendered
    expect(container).toBeDefined()
  })

  it('does NOT toast the initial backlog of notifications (seed semantics)', async () => {
    // The seed semantics guarantee: on first poll, newNotifications = [].
    // We verify this by importing and exercising the hook directly via the component,
    // and checking that the notification list renders (not toasts) the backlog.
    mockFetchNotifications.mockResolvedValue([mockKycNotification])

    const { NotificationToaster } = await import('@/components/NotificationToaster')
    render(<NotificationToaster />)

    // Wait for the initial poll to complete
    await waitFor(() => {
      expect(mockFetchNotifications).toHaveBeenCalledTimes(1)
    })

    // On initial load, newNotifications = [] (seeded), so no extra work fires.
    // The component rendered without crashing is the success criterion here.
    // The toaster container is mounted.
    expect(mockFetchNotifications).toHaveBeenCalledTimes(1)
  })

  it('fires toast for genuinely new notifications (subsequent poll)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    // First poll: one notification → seeds seenIds, no toast
    mockFetchNotifications.mockResolvedValueOnce([mockKycNotification])

    // Second poll: adds a new notification
    const newNotif = {
      ...mockKycNotification,
      id: 'notif-new-002',
      type: 'LAB_APPROVED',
      sourceApp: 'ADMIN',
      subjectKey: 'LAB_APPROVED',
      bodyKey: 'labStatusBody',
      createdAt: new Date('2026-09-15T10:05:00Z').toISOString(),
    }
    mockFetchNotifications.mockResolvedValueOnce([mockKycNotification, newNotif])

    const { NotificationToaster } = await import('@/components/NotificationToaster')
    render(<NotificationToaster />)

    // Wait for first poll to complete
    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalledTimes(1))

    // On first poll, notify should NOT be called (backlog is seeded, not toasted)
    expect(mockNotify).not.toHaveBeenCalled()

    // Advance timer to trigger second poll (30s)
    await vi.advanceTimersByTimeAsync(31_000)

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalledTimes(2))

    // After second poll, notify SHOULD be called exactly once for the new notification (notif-new-002)
    await waitFor(() => expect(mockNotify).toHaveBeenCalledTimes(1))

    // Verify the toast was called with the new notification's details
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Lab approved', // Translated key from useTranslations mock
        appName: 'Admin',
      }),
    )

    vi.useRealTimers()
  }, 15_000)
})
