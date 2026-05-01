import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { NotificationIndicator } from '@/components/NotificationIndicator'

// Mock the notification API
jest.mock('@/lib/notification-api', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue({ count: 2 }),
  fetchNotifications: jest.fn().mockResolvedValue({
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
  acknowledgeNotification: jest.fn().mockResolvedValue({ success: true }),
}))

describe('NotificationIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders bell with unread badge count', async () => {
    const { getByText, getByLabelText } = render(<NotificationIndicator />)

    await waitFor(() => {
      expect(getByText('2')).toBeTruthy()
    })

    expect(getByLabelText(/Notifications.*2 unread/)).toBeTruthy()
  })

  it('opens notification list modal on press', async () => {
    const { getByLabelText, getByText } = render(<NotificationIndicator />)

    await waitFor(() => {
      expect(getByText('2')).toBeTruthy()
    })

    fireEvent.press(getByLabelText(/Notifications/))

    await waitFor(() => {
      expect(getByText('Notifications')).toBeTruthy()
    })
  })

  it('displays lab result notifications', async () => {
    const { getByLabelText, getByText } = render(<NotificationIndicator />)

    await waitFor(() => {
      expect(getByText('2')).toBeTruthy()
    })

    fireEvent.press(getByLabelText(/Notifications/))

    await waitFor(() => {
      expect(getByText('Lab Result Available')).toBeTruthy()
      expect(getByText('Lab Result — Urgent')).toBeTruthy()
    })
  })

  it('shows test category and lab name', async () => {
    const { getByLabelText, getByText } = render(<NotificationIndicator />)

    await waitFor(() => {
      expect(getByText('2')).toBeTruthy()
    })

    fireEvent.press(getByLabelText(/Notifications/))

    await waitFor(() => {
      expect(getByText(/CBC — Lab Alpha/)).toBeTruthy()
    })
  })

  it('calls acknowledgeNotification on View press', async () => {
    const { acknowledgeNotification } = require('@/lib/notification-api')
    const { getByLabelText, getAllByText } = render(<NotificationIndicator />)

    await waitFor(() => {
      expect(getByLabelText(/Notifications/)).toBeTruthy()
    })

    fireEvent.press(getByLabelText(/Notifications/))

    await waitFor(() => {
      expect(getAllByText('View').length).toBeGreaterThan(0)
    })

    fireEvent.press(getAllByText('View')[0])

    await waitFor(() => {
      expect(acknowledgeNotification).toHaveBeenCalledWith('n1')
    })
  })
})
