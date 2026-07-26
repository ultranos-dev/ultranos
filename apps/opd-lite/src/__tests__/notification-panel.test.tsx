import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { NotificationBell } from '../components/NotificationPanel'

// next-intl context isn't provided in unit tests; components only need the locale.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

// Mock the notification API
vi.mock('../lib/notification-api', () => ({
  fetchUnreadCount: vi.fn().mockResolvedValue({ count: 3 }),
  fetchNotifications: vi.fn().mockResolvedValue({
    notifications: [
      {
        id: 'n1',
        type: 'LAB_RESULT_AVAILABLE',
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
  acknowledgeNotification: vi.fn().mockResolvedValue({ success: true }),
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('displays lab result notifications with correct labels', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // Labels are now resolved via useTranslations('notifications'); the mock returns the i18n key
      expect(screen.getByText('typeLab')).toBeInTheDocument()
      expect(screen.getByText('typeLabUrgent')).toBeInTheDocument()
    })
  })

  it('shows test category and lab name in notification', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getByText(/CBC/)).toBeInTheDocument()
      expect(screen.getByText(/Lab Alpha/)).toBeInTheDocument()
    })
  })

  it('renders View Report button for unread notifications with diagnosticReportId', async () => {
    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // t('viewReport') returns key 'viewReport' via mock
      const viewButtons = screen.getAllByText('viewReport')
      expect(viewButtons.length).toBeGreaterThan(0)
    })
  })

  it('calls acknowledgeNotification on View Report click', async () => {
    const { acknowledgeNotification } = await import('../lib/notification-api')

    render(<NotificationBell />)

    const bell = await screen.findByLabelText('bellUnreadAria')
    fireEvent.click(bell)

    await waitFor(() => {
      // t('viewReport') returns key 'viewReport' via mock
      expect(screen.getAllByText('viewReport').length).toBeGreaterThan(0)
    })

    const viewBtn = screen.getAllByText('viewReport')[0]
    fireEvent.click(viewBtn)

    await waitFor(() => {
      expect(acknowledgeNotification).toHaveBeenCalledWith('n1')
    })
  })
})
