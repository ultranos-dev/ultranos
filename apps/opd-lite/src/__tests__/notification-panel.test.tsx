import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { NotificationBell } from '../components/NotificationPanel'

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

    expect(screen.getByLabelText(/Notifications.*3 unread/)).toBeInTheDocument()
  })

  it('opens notification panel on click', async () => {
    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument()
    })
  })

  it('displays lab result notifications with correct labels', async () => {
    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getByText('Lab Result Available')).toBeInTheDocument()
      expect(screen.getByText('Lab Result — Urgent')).toBeInTheDocument()
    })
  })

  it('shows test category and lab name in notification', async () => {
    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getByText(/CBC/)).toBeInTheDocument()
      expect(screen.getByText(/Lab Alpha/)).toBeInTheDocument()
    })
  })

  it('renders View Report button for unread notifications with diagnosticReportId', async () => {
    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      const viewButtons = screen.getAllByText('View Report')
      expect(viewButtons.length).toBeGreaterThan(0)
    })
  })

  it('calls acknowledgeNotification on View Report click', async () => {
    const { acknowledgeNotification } = await import('../lib/notification-api')

    render(<NotificationBell />)

    const bell = screen.getByLabelText(/Notifications/)
    fireEvent.click(bell)

    await waitFor(() => {
      expect(screen.getAllByText('View Report').length).toBeGreaterThan(0)
    })

    const viewBtn = screen.getAllByText('View Report')[0]
    fireEvent.click(viewBtn)

    await waitFor(() => {
      expect(acknowledgeNotification).toHaveBeenCalledWith('n1')
    })
  })
})
