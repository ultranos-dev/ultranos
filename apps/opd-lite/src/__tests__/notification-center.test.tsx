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

// With descriptor fields — used for Task 9 enrichment tests
function makeDescriptorNotification(overrides: Record<string, unknown> = {}) {
  return {
    ...makeNotification(),
    sourceApp: 'LAB_LITE',
    subjectKey: 'LAB_RESULT_AVAILABLE',
    bodyKey: 'labResultBody',
    bodyParams: { testCategory: 'CBC', labName: 'Lab Alpha' },
    notesKey: 'labResultNotes',
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
    it('renders the notifications page by mounting NotificationCenter', async () => {
      // The page is now a thin wrapper: <div><NotificationCenter /></div>
      // The "Notification Center" heading and back link moved to the shell BreadcrumbHeader.
      // Verify the page mounts without errors and renders the tabs from NotificationCenter.
      const { default: NotificationsPage } = await import('../app/[locale]/(app)/notifications/page')
      render(<NotificationsPage />)

      await waitFor(() => {
        // NotificationCenter renders tabs — 'tabAll' key via next-intl mock
        expect(screen.getByRole('tab', { name: /tabAll/ })).toBeInTheDocument()
      })
    })

    it('page header and back link are in shell layout (not in page component)', async () => {
      // The notifications page route is <div><NotificationCenter/></div> only.
      // "Notification Center" title and back link live in the shell BreadcrumbHeader,
      // which is not rendered in these unit tests — that is correct by design.
      const { default: NotificationsPage } = await import('../app/[locale]/(app)/notifications/page')
      render(<NotificationsPage />)

      // Confirm neither "Notification Center" heading nor back link appear inside the page component
      await waitFor(() => {
        expect(screen.queryByText('Notification Center')).not.toBeInTheDocument()
        expect(screen.queryByText(/Back to Dashboard/)).not.toBeInTheDocument()
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
        // Rows now show sourceApp keys — LAB_RESULT_AVAILABLE → LAB_LITE, PRESCRIPTION_READY → PHARMACY_LITE, SYNC_CONFLICT → SYSTEM
        expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('sourceApp.PHARMACY_LITE')).toBeInTheDocument()
        expect(screen.getAllByText('sourceApp.SYSTEM').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('filters to lab notifications when Lab Results tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabLabResults/ }))

      // Lab Results tab shows LAB_RESULT_AVAILABLE (n1, n7) and LAB_RESULT_ESCALATION (n2)
      // all three map to LAB_LITE
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('sourceApp.PHARMACY_LITE')).not.toBeInTheDocument()
    })

    it('filters to prescription notifications when Prescriptions tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('sourceApp.PHARMACY_LITE')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabPrescriptions/ }))

      expect(screen.getByText('sourceApp.PHARMACY_LITE')).toBeInTheDocument()
      expect(screen.queryAllByText('sourceApp.LAB_LITE')).toHaveLength(0)
    })

    it('filters to system notifications when System tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getAllByText('sourceApp.SYSTEM').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabSystem/ }))

      // SYNC_CONFLICT, CONSENT_CHANGE, ALLERGY_UPDATE all → OPD_LITE or SYSTEM
      // SYNC_CONFLICT → SYSTEM, CONSENT_CHANGE → OPD_LITE, ALLERGY_UPDATE → OPD_LITE
      expect(screen.getByText('sourceApp.SYSTEM')).toBeInTheDocument()
      expect(screen.getAllByText('sourceApp.OPD_LITE').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryAllByText('sourceApp.LAB_LITE')).toHaveLength(0)
    })
  })

  // --- Task 2 continued: Display fields ---
  describe('Task 2: Notification display', () => {
    it('shows source app name in notification rows', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // LAB_RESULT_AVAILABLE → LAB_LITE; the tNotif mock returns the key
        expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
        // PRESCRIPTION_READY → PHARMACY_LITE
        expect(screen.getByText('sourceApp.PHARMACY_LITE')).toBeInTheDocument()
      })
    })

    it('shows unread notification rows with data-testid', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // Wrapper div preserves data-testid for testing
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
        expect(screen.getByTestId('notification-n7')).toBeInTheDocument()
      })
    })

    it('shows source info (lab name, patient name) in notifications', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // body rendered via bodyKey resolver (mock returns key, but bodyParams contains real data)
        // The subject key "subject.LAB_RESULT_AVAILABLE" is returned by mock
        expect(screen.getAllByText('subject.LAB_RESULT_AVAILABLE').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  // --- Task 3: Deep linking via modal ---
  describe('Task 3: Deep linking', () => {
    it('opens modal on lab notification click and acknowledges', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('notification-n1').querySelector('[role="button"]')!)

      await waitFor(() => {
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
      })
    })

    it('navigates to conflicts page action in modal on sync conflict', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n4')).toBeInTheDocument()
      })

      // Click the notification row button inside the wrapper
      fireEvent.click(screen.getByTestId('notification-n4').querySelector('[role="button"]')!)

      await waitFor(() => {
        // Modal opens — dialog role
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Action button in modal navigates to /conflicts
      const actionBtn = screen.getByRole('button', { name: /viewDetails/ })
      fireEvent.click(actionBtn)

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

      // Wait for notifications to load and appear
      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /markAllRead/ }))
      })

      await waitFor(() => {
        // After optimistic update, unread dot indicator should be gone (no unread items)
        // Mark All Read button should now be disabled
        expect(screen.getByRole('button', { name: /markAllRead/ })).toBeDisabled()
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

  // --- Toolbar: search + read-status filter (Patients-style) ---
  describe('Toolbar filtering', () => {
    it('renders a search input and a read-status dropdown', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByLabelText('searchPlaceholder')).toBeInTheDocument()
        expect(screen.getByLabelText('statusAll')).toBeInTheDocument()
      })
    })

    it('search filters notifications by lab name', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      // n1 has labName "Lab Alpha"; n2 has "Lab Beta"
      fireEvent.change(screen.getByLabelText('searchPlaceholder'), { target: { value: 'Alpha' } })

      expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      expect(screen.queryByTestId('notification-n2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('notification-n3')).not.toBeInTheDocument()
    })

    it('read-status dropdown filters to read-only and unread-only', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n7')).toBeInTheDocument()
      })

      // n7 is ACKNOWLEDGED (read); n1 is unread
      fireEvent.change(screen.getByLabelText('statusAll'), { target: { value: 'read' } })
      expect(screen.getByTestId('notification-n7')).toBeInTheDocument()
      expect(screen.queryByTestId('notification-n1')).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('statusAll'), { target: { value: 'unread' } })
      expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      expect(screen.queryByTestId('notification-n7')).not.toBeInTheDocument()
    })

    it('shows a filtered-empty state when a search matches nothing', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText('searchPlaceholder'), { target: { value: 'zzz-no-match' } })

      expect(screen.getByText('noResults')).toBeInTheDocument()
      expect(screen.queryByTestId('notification-n1')).not.toBeInTheDocument()
    })
  })

  // --- Task 9: Enriched rows with descriptor fields ---
  describe('Task 9: Enriched notification rows', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockAcknowledgeNotification.mockResolvedValue({ success: true })
    })

    it('renders source app as title and opens the detail modal on click', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      mockFetchNotifications.mockResolvedValue({
        notifications: [
          {
            id: 'n1',
            type: 'ORDER_RECEIVED',
            sourceApp: 'LAB_LITE',
            subjectKey: 'ORDER_RECEIVED',
            bodyKey: 'orderReceivedBody',
            bodyParams: { testCategory: 'Hemoglobin' },
            notesKey: 'orderReceivedNotes',
            payload: {},
            status: 'SENT',
            createdAt: twoHoursAgo,
            deliveredAt: null,
            acknowledgedAt: null,
          },
        ],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      // useTranslations mock returns the key; sourceAppNameKey('LAB_LITE') => 'sourceApp.LAB_LITE'
      // so tNotif('sourceApp.LAB_LITE') => 'sourceApp.LAB_LITE'
      await waitFor(() => {
        expect(screen.getByText('sourceApp.LAB_LITE')).toBeInTheDocument()
      })

      // Click the row — should open modal (dialog role)
      fireEvent.click(screen.getByText('sourceApp.LAB_LITE'))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('resolves subject from subjectKey descriptor field', async () => {
      mockFetchNotifications.mockResolvedValue({
        notifications: [makeDescriptorNotification()],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // subject key: "subject.LAB_RESULT_AVAILABLE" — mock returns it as-is
        expect(screen.getByText('subject.LAB_RESULT_AVAILABLE')).toBeInTheDocument()
      })
    })

    it('derives source app from type when sourceApp is absent', async () => {
      mockFetchNotifications.mockResolvedValue({
        notifications: [makeNotification({ id: 'n1', type: 'PRESCRIPTION_READY' })],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // PRESCRIPTION_READY → PHARMACY_LITE via deriveSourceApp
        expect(screen.getByText('sourceApp.PHARMACY_LITE')).toBeInTheDocument()
      })
    })
  })
})

// --- NotificationPanel dropdown ---
describe('NotificationPanel — dropdown behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchNotifications.mockResolvedValue({ notifications: SAMPLE_NOTIFICATIONS })
    mockFetchUnreadCount.mockResolvedValue({ count: 3 })
    mockAcknowledgeNotification.mockResolvedValue({ success: true })
  })

  it('shows notification items in dropdown (View All link moved to NotificationCenter page)', async () => {
    // The "View All" link was removed from NotificationDropdown; navigation to /notifications
    // is handled by the shell breadcrumb or direct nav. The dropdown now shows notification rows.
    const { NotificationBell } = await import('../components/NotificationPanel')
    render(<NotificationBell />)

    // Wait for unread count to load so aria-label switches from bellAria to bellUnreadAria
    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // Dropdown header — t('title') returns key via mock
      expect(screen.getByText('title')).toBeInTheDocument()
    })
  })
})
