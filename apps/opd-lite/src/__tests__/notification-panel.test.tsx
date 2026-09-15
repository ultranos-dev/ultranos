import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { NotificationBell } from '../components/NotificationPanel'

// next-intl context isn't provided in unit tests; components only need the locale.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock the notification API
const mockDeleteNotificationPanel = vi.fn().mockResolvedValue({ success: true })
const mockAcknowledgeNotificationPanel = vi.fn().mockResolvedValue({ success: true })

vi.mock('../lib/notification-api', () => ({
  fetchUnreadCount: vi.fn().mockResolvedValue({ count: 3 }),
  fetchNotifications: vi.fn().mockResolvedValue({
    notifications: [
      {
        id: 'n1',
        type: 'LAB_RESULT_AVAILABLE',
        sourceApp: 'LAB_LITE',
        subjectKey: 'LAB_RESULT_AVAILABLE',
        bodyKey: 'labResultBody',
        bodyParams: { testCategory: 'CBC', labName: 'Lab Alpha' },
        notesKey: 'labResultNotes',
        payload: {
          testCategory: 'CBC',
          labName: 'Lab Alpha',
          uploadTimestamp: '2026-04-30T00:00:00.000Z',
          diagnosticReportId: '00000000-0000-4000-8000-000000000001',
        },
        status: 'SENT',
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        acknowledgedAt: null,
      },
      {
        id: 'n2',
        type: 'LAB_RESULT_ESCALATION',
        sourceApp: 'LAB_LITE',
        subjectKey: 'LAB_RESULT_ESCALATION',
        bodyKey: 'labResultBody',
        bodyParams: { testCategory: 'Blood Glucose', labName: 'Lab Beta' },
        payload: {
          testCategory: 'Blood Glucose',
          labName: 'Lab Beta',
          uploadTimestamp: '2026-04-29T12:00:00.000Z',
          diagnosticReportId: '00000000-0000-4000-8000-000000000002',
        },
        status: 'SENT',
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        deliveredAt: null,
        acknowledgedAt: null,
      },
    ],
  }),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotificationPanel(...args),
  deleteNotification: (...args: unknown[]) => mockDeleteNotificationPanel(...args),
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteNotificationPanel.mockResolvedValue({ success: true })
    mockAcknowledgeNotificationPanel.mockResolvedValue({ success: true })
  })

  it('renders bell icon with unread count badge', async () => {
    render(<NotificationBell />)

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    // t('bellUnreadAria', { count: 3 }) returns key 'bellUnreadAria' via mock
    expect(screen.getByLabelText('bellUnreadAria')).toBeInTheDocument()
  })

  it('opens notification panel on click', async () => {
    render(<NotificationBell />)

    // Wait for count to load so aria-label switches to bellUnreadAria
    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // t('title') returns key via mock
      expect(screen.getByText('title')).toBeInTheDocument()
    })
  })

  it('displays source app name in notification rows', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // Rows now show sourceApp key — both n1 and n2 have sourceApp: 'LAB_LITE'
      // tNotif('sourceApp.LAB_LITE') returns 'sourceApp.LAB_LITE' via mock
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows subject keys in notification rows', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // subject.LAB_RESULT_AVAILABLE and subject.LAB_RESULT_ESCALATION keys
      expect(screen.getByText('subject.LAB_RESULT_AVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('subject.LAB_RESULT_ESCALATION')).toBeInTheDocument()
    })
  })

  it('opens modal when a notification row is clicked', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
    })

    // Click the first notification row
    const rows = screen.getAllByRole('button').filter(b => !b.getAttribute('aria-label'))
    const firstRow = rows[0]
    if (!firstRow) throw new Error('No notification row button found')
    fireEvent.click(firstRow)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('calls acknowledgeNotification when a notification row is clicked', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
    })

    // Click the first notification row button
    const rows = screen.getAllByRole('button').filter(b => !b.getAttribute('aria-label'))
    const firstRow = rows[0]
    if (!firstRow) throw new Error('No notification row button found')
    fireEvent.click(firstRow)

    await waitFor(() => {
      expect(mockAcknowledgeNotificationPanel).toHaveBeenCalledWith('n1')
    })
  })

  // --- T3: Mark-read + delete action icons (NotificationPanel) ---
  it('T3: delete button in panel calls deleteNotification with the id', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
    })

    // The delete button has aria-label 'delete' (mock returns key as-is)
    const [deleteBtn0] = screen.getAllByRole('button', { name: /delete/i })
    if (!deleteBtn0) throw new Error('No delete button found')
    await act(async () => {
      fireEvent.click(deleteBtn0)
    })

    await waitFor(() => {
      expect(mockDeleteNotificationPanel).toHaveBeenCalledWith('n1')
    })
  })

  it('T3: delete removes the row from the panel list', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    // Both n1 and n2 rows visible — each shows 'sourceApp.LAB_LITE'
    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(2)
    })

    const [deleteFirst] = screen.getAllByRole('button', { name: /delete/i })
    if (!deleteFirst) throw new Error('No delete button found')
    await act(async () => {
      fireEvent.click(deleteFirst)
    })

    // After delete of n1, only n2 remains — count drops to 1
    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeLessThan(2)
    })
  })

  it('T3: mark-read button in panel calls acknowledgeNotification', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getAllByText('sourceApp.LAB_LITE').length).toBeGreaterThanOrEqual(1)
    })

    // The mark-read button has aria-label 'markRead' (mock returns key as-is)
    const [markReadBtn0] = screen.getAllByRole('button', { name: /markRead/i })
    if (!markReadBtn0) throw new Error('No mark-read button found')
    await act(async () => {
      fireEvent.click(markReadBtn0)
    })

    await waitFor(() => {
      expect(mockAcknowledgeNotificationPanel).toHaveBeenCalledWith('n1')
    })
  })
})
