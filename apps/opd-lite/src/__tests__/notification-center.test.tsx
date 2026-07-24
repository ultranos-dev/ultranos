import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

// next-intl context isn't provided in unit tests; components only need the locale.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock notification API
const mockFetchNotifications = vi.fn()
const mockFetchUnreadCount = vi.fn()
const mockAcknowledgeNotification = vi.fn()

vi.mock('../lib/notification-api', () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  fetchUnreadCount: (...args: unknown[]) => mockFetchUnreadCount(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
}))

// Mock AuthGuard to pass through
vi.mock('../components/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock SessionTimeoutWrapper to pass through
vi.mock('../components/SessionTimeoutWrapper', () => ({
  SessionTimeoutWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock db and audit modules (used by NotificationCenter for PHI audit)
vi.mock('../lib/db', () => ({
  db: { diagnosticReports: { get: vi.fn().mockResolvedValue(null) } },
}))

vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { PHI_READ: 'PHI_READ' },
  AuditResourceType: { LAB_RESULT: 'LAB_RESULT' },
}))

const NOW = new Date('2026-05-11T12:00:00.000Z')

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'LAB_RESULT_AVAILABLE',
    payload: {
      testCategory: 'CBC',
      labName: 'Lab Alpha',
      uploadTimestamp: '2026-05-10T10:00:00.000Z',
      diagnosticReportId: '00000000-0000-4000-8000-000000000001',
    },
    status: 'SENT',
    createdAt: new Date(NOW.getTime() - 300_000).toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    ...overrides,
  }
}

const SAMPLE_NOTIFICATIONS = [
  makeNotification({ id: 'n1', type: 'LAB_RESULT_AVAILABLE' }),
  makeNotification({
    id: 'n2',
    type: 'LAB_RESULT_ESCALATION',
    payload: {
      testCategory: 'Blood Glucose',
      labName: 'Lab Beta',
      diagnosticReportId: '00000000-0000-4000-8000-000000000002',
    },
  }),
  makeNotification({
    id: 'n3',
    type: 'PRESCRIPTION_READY',
    payload: { message: 'Prescription fulfilled' },
  }),
  makeNotification({
    id: 'n4',
    type: 'SYNC_CONFLICT',
    payload: { message: 'Allergy conflict detected' },
  }),
  makeNotification({
    id: 'n5',
    type: 'CONSENT_CHANGE',
    payload: { message: 'Consent updated' },
  }),
  makeNotification({
    id: 'n6',
    type: 'ALLERGY_UPDATE',
    payload: { message: 'Allergy added' },
  }),
  makeNotification({
    id: 'n7',
    type: 'LAB_RESULT_AVAILABLE',
    status: 'ACKNOWLEDGED',
    acknowledgedAt: '2026-05-10T11:00:00.000Z',
    payload: {
      testCategory: 'Urinalysis',
      labName: 'Lab Gamma',
      diagnosticReportId: '00000000-0000-4000-8000-000000000003',
    },
  }),
]

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchNotifications.mockResolvedValue({ notifications: SAMPLE_NOTIFICATIONS })
    mockFetchUnreadCount.mockResolvedValue({ count: 6 })
    mockAcknowledgeNotification.mockResolvedValue({ success: true })
  })

  // --- Task 1: Route page renders ---
  describe('Task 1: Notification center route', () => {
    it('renders the notification center page with header', async () => {
      const { default: NotificationsPage } = await import('../app/[locale]/(app)/notifications/page')
      render(<NotificationsPage />)

      await waitFor(() => {
        expect(screen.getByText('Notification Center')).toBeInTheDocument()
      })
    })

    it('has a back link to dashboard', async () => {
      const { default: NotificationsPage } = await import('../app/[locale]/(app)/notifications/page')
      render(<NotificationsPage />)

      await waitFor(() => {
        const backLink = screen.getByText(/Back to Dashboard/)
        expect(backLink).toBeInTheDocument()
        expect(backLink.closest('a')).toHaveAttribute('href', '/')
      })
    })
  })

  // --- Task 2: Tabs filter by type ---
  describe('Task 2: Tab filtering', () => {
    it('renders all four tabs: All, Lab Results, Prescriptions, System', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /tabAll/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /tabLabResults/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /tabPrescriptions/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /tabSystem/ })).toBeInTheDocument()
      })
    })

    it('shows all notifications by default on All tab', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // n1 and n7 both have LAB_RESULT_AVAILABLE, so use getAllByText
        expect(screen.getAllByText('typeLab').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('typePrescription')).toBeInTheDocument()
        expect(screen.getByText('typeSyncConflict')).toBeInTheDocument()
      })
    })

    it('filters to lab notifications when Lab Results tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getAllByText('typeLab').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabLabResults/ }))

      // Lab Results tab shows LAB_RESULT_AVAILABLE (n1, n7) and LAB_RESULT_ESCALATION (n2)
      expect(screen.getAllByText('typeLab').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('typeLabUrgent')).toBeInTheDocument()
      expect(screen.queryByText('typePrescription')).not.toBeInTheDocument()
      expect(screen.queryByText('typeSyncConflict')).not.toBeInTheDocument()
    })

    it('filters to prescription notifications when Prescriptions tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('typePrescription')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabPrescriptions/ }))

      expect(screen.getByText('typePrescription')).toBeInTheDocument()
      expect(screen.queryAllByText('typeLab')).toHaveLength(0)
    })

    it('filters to system notifications when System tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('typeSyncConflict')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabSystem/ }))

      expect(screen.getByText('typeSyncConflict')).toBeInTheDocument()
      expect(screen.getByText('typeConsent')).toBeInTheDocument()
      expect(screen.getByText('typeAllergyUpdate')).toBeInTheDocument()
      expect(screen.queryAllByText('typeLab')).toHaveLength(0)
    })
  })

  // --- Task 2 continued: Display fields ---
  describe('Task 2: Notification display', () => {
    it('shows type-specific icons (beaker for lab, pill for Rx, gear for system)', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('icon-lab-n1')).toBeInTheDocument()
        expect(screen.getByTestId('icon-rx-n3')).toBeInTheDocument()
        expect(screen.getByTestId('icon-system-n4')).toBeInTheDocument()
      })
    })

    it('shows read/unread status with visual distinction', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        const unreadRow = screen.getByTestId('notification-n1')
        expect(unreadRow).toHaveClass('bg-primary/10')

        const readRow = screen.getByTestId('notification-n7')
        expect(readRow).not.toHaveClass('bg-primary/10')
      })
    })

    it('shows source info (lab name, patient name) in notifications', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText(/Lab Alpha/)).toBeInTheDocument()
        expect(screen.getByText(/CBC/)).toBeInTheDocument()
      })
    })
  })

  // --- Task 3: Deep linking ---
  describe('Task 3: Deep linking', () => {
    it('navigates to lab results on lab notification click', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('notification-n1'))

      await waitFor(() => {
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
        expect(mockPush).toHaveBeenCalled()
      })
    })

    it('navigates to conflicts page on sync conflict click', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n4')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('notification-n4'))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/conflicts')
      })
    })
  })

  // --- Task 4: Mark All Read ---
  describe('Task 4: Mark All Read', () => {
    it('renders Mark All Read button', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /markAllRead/ })).toBeInTheDocument()
      })
    })

    it('acknowledges all unread notifications on Mark All Read click', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /markAllRead/ })).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /markAllRead/ }))
      })

      await waitFor(() => {
        // 6 unread notifications (n1-n6, n7 is already ACKNOWLEDGED)
        expect(mockAcknowledgeNotification).toHaveBeenCalledTimes(6)
      })
    })

    it('optimistically marks all as read in the UI', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toHaveClass('bg-primary/10')
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /markAllRead/ }))
      })

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).not.toHaveClass('bg-primary/10')
      })
    })
  })

  // --- Task 5: Polling ---
  describe('Task 5: Polling integration', () => {
    it('fetches notifications on mount', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(1)
      })
    })

    it('polls for new notifications every 30 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      mockFetchNotifications.mockResolvedValue({ notifications: SAMPLE_NOTIFICATIONS })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(1)
      })

      // Advance 30s
      await act(async () => {
        vi.advanceTimersByTime(30_000)
      })

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(2)
      })

      // Advance another 30s
      await act(async () => {
        vi.advanceTimersByTime(30_000)
      })

      await waitFor(() => {
        expect(mockFetchNotifications).toHaveBeenCalledTimes(3)
      })

      vi.useRealTimers()
    })
  })

  // --- Task 5 continued: Shared hook ---
  describe('Task 5: Shared polling hook', () => {
    it('exports useNotificationPoll hook', async () => {
      const mod = await import('../lib/use-notification-poll')
      expect(mod.useNotificationPoll).toBeDefined()
      expect(typeof mod.useNotificationPoll).toBe('function')
    })
  })

  // --- Task 6: Additional edge cases ---
  describe('Task 6: Edge cases and offline', () => {
    it('shows empty state when no notifications', async () => {
      mockFetchNotifications.mockResolvedValue({ notifications: [] })
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText(/noNotifications/)).toBeInTheDocument()
      })
    })

    it('shows offline banner when fetch fails', async () => {
      mockFetchNotifications.mockRejectedValue(new Error('Network error'))
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText(/offlineError/)).toBeInTheDocument()
      })
    })

    it('disables Mark All Read when no unread notifications', async () => {
      mockFetchNotifications.mockResolvedValue({
        notifications: [
          makeNotification({ id: 'n1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-05-10T11:00:00.000Z' }),
        ],
      })
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /markAllRead/ })).toBeDisabled()
      })
    })
  })
})

// --- NotificationPanel "View All" link ---
describe('NotificationPanel — View All link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchNotifications.mockResolvedValue({ notifications: SAMPLE_NOTIFICATIONS })
    mockFetchUnreadCount.mockResolvedValue({ count: 3 })
    mockAcknowledgeNotification.mockResolvedValue({ success: true })
  })

  it('shows View All link in notification dropdown', async () => {
    const { NotificationBell } = await import('../components/NotificationPanel')
    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      const viewAll = screen.getByText('View All')
      expect(viewAll).toBeInTheDocument()
      expect(viewAll.closest('a')).toHaveAttribute('href', '/notifications')
    })
  })
})
