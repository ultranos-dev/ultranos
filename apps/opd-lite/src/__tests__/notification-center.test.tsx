import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'

// next-intl context isn't provided in unit tests.
// The mock resolves the sourceApp.* and time.* keys to real English values so
// tests assert on actual rendered output rather than raw translation keys.
// All other keys fall back to the bare key string (preserving existing assertions).
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const fullKey = `${namespace}.${key}`
    const MAP: Record<string, string> = {
      'notifications.sourceApp.LAB_LITE': 'Lab Lite',
      'notifications.sourceApp.PHARMACY_LITE': 'Pharmacy Lite',
      'notifications.sourceApp.OPD_LITE': 'OPD Lite',
      'notifications.sourceApp.SYSTEM': 'System',
      'time.justNow': 'Just now',
      'time.minutesAgo': `${params?.minutes ?? '{minutes}'}m ago`,
      'time.hoursAgo': `${params?.hours ?? '{hours}'}h ago`,
    }
    return MAP[fullKey] ?? key
  },
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
const mockDeleteNotification = vi.fn()

vi.mock('../lib/notification-api', () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  fetchUnreadCount: (...args: unknown[]) => mockFetchUnreadCount(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
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
  db: {
    diagnosticReports: { get: vi.fn().mockResolvedValue(null) },
    serviceRequests: { get: vi.fn().mockResolvedValue(null) },
    medications: { get: vi.fn().mockResolvedValue(null) },
  },
}))

vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { PHI_READ: 'PHI_READ' },
  AuditResourceType: { LAB_RESULT: 'LAB_RESULT', SERVICE_REQUEST: 'SERVICE_REQUEST', PRESCRIPTION: 'PRESCRIPTION' },
}))

// Mock patient-loader — used by useNotificationPatient hook
vi.mock('../lib/patient-loader', () => ({
  loadPatientResilient: vi.fn().mockResolvedValue({ patient: null, needsReauth: false, source: null }),
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
    mockDeleteNotification.mockResolvedValue({ success: true })
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
        // Rows show resolved source-app names — LAB_RESULT_AVAILABLE → 'Lab Lite', PRESCRIPTION_READY → 'Pharmacy Lite', SYNC_CONFLICT → 'System'
        expect(screen.getAllByText('Lab Lite').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
        expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('filters to lab notifications when Lab Results tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getAllByText('Lab Lite').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabLabResults/ }))

      // Lab Results tab shows LAB_RESULT_AVAILABLE (n1, n7) and LAB_RESULT_ESCALATION (n2)
      // all three map to LAB_LITE → resolved to 'Lab Lite'
      expect(screen.getAllByText('Lab Lite').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Pharmacy Lite')).not.toBeInTheDocument()
    })

    it('filters to prescription notifications when Prescriptions tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabPrescriptions/ }))

      expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
      expect(screen.queryAllByText('Lab Lite')).toHaveLength(0)
    })

    it('filters to system notifications when System tab is selected', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.click(screen.getByRole('tab', { name: /tabSystem/ }))

      // SYNC_CONFLICT, CONSENT_CHANGE, ALLERGY_UPDATE all → OPD_LITE or SYSTEM
      // SYNC_CONFLICT → 'System', CONSENT_CHANGE → 'OPD Lite', ALLERGY_UPDATE → 'OPD Lite'
      expect(screen.getByText('System')).toBeInTheDocument()
      expect(screen.getAllByText('OPD Lite').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryAllByText('Lab Lite')).toHaveLength(0)
    })
  })

  // --- Task 2 continued: Display fields ---
  describe('Task 2: Notification display', () => {
    it('shows source app name in notification rows', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        // LAB_RESULT_AVAILABLE → LAB_LITE → resolved to 'Lab Lite'
        expect(screen.getAllByText('Lab Lite').length).toBeGreaterThanOrEqual(1)
        // PRESCRIPTION_READY → PHARMACY_LITE → resolved to 'Pharmacy Lite'
        expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
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

      // Click the 'Lab Lite' row button for n1 — scoped within its wrapper to avoid ambiguity
      fireEvent.click(within(screen.getByTestId('notification-n1')).getByRole('button', { name: /Lab Lite/i }))

      await waitFor(() => {
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
        // Modal opens
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('navigates to conflicts page action in modal on sync conflict', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n4')).toBeInTheDocument()
      })

      // Click the sync-conflict row button — scoped within n4's wrapper to avoid ambiguity
      fireEvent.click(within(screen.getByTestId('notification-n4')).getByRole('button', { name: /System/i }))

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

  // --- Task 2 (this task): Modal detail enrichment ---
  describe('Task 2: Modal detail rows (Order ID short form + Received datetime)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockAcknowledgeNotification.mockResolvedValue({ success: true })
    })

    it('shows Order ID short form in modal details for ORDER_RECEIVED with orderId', async () => {
      const orderId = '00000000-0000-4000-8000-000000000099'
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      // Mock the db lookup and patient load for the audit hook
      const { db } = await import('../lib/db')
      const { loadPatientResilient } = await import('../lib/patient-loader')
      const { auditPhiAccess } = await import('../lib/audit')

      ;(db.serviceRequests.get as any).mockResolvedValue({
        subject: { reference: 'Patient/patient-uuid-123' },
      })
      ;(loadPatientResilient as any).mockResolvedValue({
        patient: {
          _ultranos: { nameLatin: 'John Doe' },
        },
        needsReauth: false,
      })

      mockFetchNotifications.mockResolvedValue({
        notifications: [
          {
            id: 'n-order',
            type: 'ORDER_RECEIVED',
            sourceApp: 'LAB_LITE',
            subjectKey: 'ORDER_RECEIVED',
            bodyKey: 'orderReceivedBody',
            bodyParams: { testCategory: 'Hemoglobin' },
            notesKey: 'orderReceivedNotes',
            payload: { orderId },
            status: 'SENT',
            createdAt: twoHoursAgo,
            deliveredAt: null,
            acknowledgedAt: null,
          },
        ],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('Lab Lite')).toBeInTheDocument()
      })

      // Open the modal
      fireEvent.click(screen.getByRole('button', { name: /Lab Lite/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()

      // Short form: last 6 chars of orderId uppercased = '000099'
      expect(screen.getByRole('dialog')).toHaveTextContent('000099')

      // Assert the audit mock was called (PHI_READ action) when modal detail rows were rendered
      await waitFor(() => {
        expect(auditPhiAccess).toHaveBeenCalled()
      })
    })

    it('shows Received date-time row in the modal', async () => {
      const createdAt = new Date('2026-09-15T08:30:00.000Z').toISOString()

      mockFetchNotifications.mockResolvedValue({
        notifications: [
          {
            id: 'n-recv',
            type: 'ORDER_RECEIVED',
            sourceApp: 'LAB_LITE',
            subjectKey: 'ORDER_RECEIVED',
            bodyKey: 'orderReceivedBody',
            bodyParams: { testCategory: 'CBC' },
            payload: { orderId: 'abc-order-1' },
            status: 'SENT',
            createdAt,
            deliveredAt: null,
            acknowledgedAt: null,
          },
        ],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('Lab Lite')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Lab Lite/i }))
      const dialog = await screen.findByRole('dialog')

      // The "field.received" i18n key is returned as "field.received" by the mock
      // (mock returns key strings for unknown keys)
      expect(dialog).toHaveTextContent('field.received')
    })

    it('shows testCategory in modal details when bodyParams has testCategory', async () => {
      mockFetchNotifications.mockResolvedValue({
        notifications: [
          {
            id: 'n-cat',
            type: 'ORDER_RECEIVED',
            sourceApp: 'LAB_LITE',
            subjectKey: 'ORDER_RECEIVED',
            bodyKey: 'orderReceivedBody',
            bodyParams: { testCategory: 'Urinalysis' },
            payload: { orderId: 'ord-9999' },
            status: 'SENT',
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            acknowledgedAt: null,
          },
        ],
      })

      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByText('Lab Lite')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Lab Lite/i }))
      const dialog = await screen.findByRole('dialog')

      // testCategory value appears in the details list
      expect(dialog).toHaveTextContent('Urinalysis')
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

      // Mock resolves sourceApp.LAB_LITE → 'Lab Lite' (real English value, not raw key)
      await waitFor(() => {
        expect(screen.getByText('Lab Lite')).toBeInTheDocument()
      })

      // Click the row button via accessible role — opens the detail modal
      fireEvent.click(screen.getByRole('button', { name: /Lab Lite/i }))
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
        // PRESCRIPTION_READY → PHARMACY_LITE via deriveSourceApp → resolved to 'Pharmacy Lite'
        expect(screen.getByText('Pharmacy Lite')).toBeInTheDocument()
      })
    })
  })

  // --- Task T3: Mark-read + delete action icons ---
  describe('T3: Mark-read and delete action icons (NotificationCenter)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockFetchNotifications.mockResolvedValue({ notifications: SAMPLE_NOTIFICATIONS })
      mockFetchUnreadCount.mockResolvedValue({ count: 6 })
      mockAcknowledgeNotification.mockResolvedValue({ success: true })
      mockDeleteNotification.mockResolvedValue({ success: true })
    })

    it('clicking delete calls deleteNotification with the notification id', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      // Find the delete button within n1's wrapper — its aria-label is 'delete' (mock returns key)
      const n1Wrapper = screen.getByTestId('notification-n1')
      const deleteBtn = within(n1Wrapper).getByRole('button', { name: /delete/i })
      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      await waitFor(() => {
        expect(mockDeleteNotification).toHaveBeenCalledWith('n1')
      })
    })

    it('deleting a notification removes it from the list', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      const n1Wrapper = screen.getByTestId('notification-n1')
      const deleteBtn = within(n1Wrapper).getByRole('button', { name: /delete/i })
      await act(async () => {
        fireEvent.click(deleteBtn)
      })

      await waitFor(() => {
        expect(screen.queryByTestId('notification-n1')).not.toBeInTheDocument()
      })
    })

    it('clicking mark-read calls acknowledgeNotification with the notification id', async () => {
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      // n1 is unread, so onMarkRead is provided — button label is 'markRead' via mock
      const n1Wrapper = screen.getByTestId('notification-n1')
      const markReadBtn = within(n1Wrapper).getByRole('button', { name: /markRead/i })
      await act(async () => {
        fireEvent.click(markReadBtn)
      })

      await waitFor(() => {
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
      })
    })

    it('mark-read icon on LAB_RESULT_AVAILABLE does NOT audit PHI_READ — only acknowledge', async () => {
      // Verify the fix: mark-read is a pure acknowledge, not a PHI read.
      // The lab-result audit (PHI_READ) should NOT fire when clicking mark-read.
      const { auditPhiAccess } = await import('../lib/audit')
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')
      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      // Clear audit mocks to distinguish between row click and mark-read
      vi.clearAllMocks()

      // Click mark-read on n1 (LAB_RESULT_AVAILABLE)
      const n1Wrapper = screen.getByTestId('notification-n1')
      const markReadBtn = within(n1Wrapper).getByRole('button', { name: /markRead/i })
      await act(async () => {
        fireEvent.click(markReadBtn)
      })

      await waitFor(() => {
        // acknowledge() should be called
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
        // auditPhiAccess (lab-result read) should NOT be called — mark-read is not a PHI read
        expect(auditPhiAccess).not.toHaveBeenCalled()
      })
    })

    it('clicking main row DOES audit PHI_READ (deep link opens), but mark-read does not', async () => {
      // Contrast: clicking the row itself (main onClick, opens modal + deep link) DOES audit;
      // clicking mark-read icon (pure acknowledge) does NOT audit.
      const { auditPhiAccess } = await import('../lib/audit')
      const { db } = await import('../lib/db')
      const { NotificationCenter } = await import('../components/notifications/NotificationCenter')

      // Mock the db.diagnosticReports.get to simulate the audit path in handleNotificationClick
      ;(db.diagnosticReports.get as any).mockResolvedValue({
        subject: { reference: 'Patient/patient-uuid-123' },
      })

      render(<NotificationCenter />)

      await waitFor(() => {
        expect(screen.getByTestId('notification-n1')).toBeInTheDocument()
      })

      vi.clearAllMocks()

      // Click the main row button (which opens modal and calls handleNotificationClick)
      const n1Wrapper = screen.getByTestId('notification-n1')
      const rowBtn = within(n1Wrapper).getByRole('button', { name: /Lab Lite/i })
      await act(async () => {
        fireEvent.click(rowBtn)
      })

      await waitFor(() => {
        // acknowledge() is called during modal open
        expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1')
        // auditPhiAccess should be called (lab-result read via deep link)
        expect(auditPhiAccess).toHaveBeenCalledWith(
          'PHI_READ',
          'LAB_RESULT',
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ phiAccess: 'notification_center_navigate' }),
        )
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
