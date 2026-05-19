import { render, fireEvent } from '@testing-library/react-native'

// Mock the store and hook
jest.mock('@/stores/notification-store', () => ({
  useNotificationStore: jest.fn((selector) => {
    if (typeof selector === 'function') {
      return selector({ unreadCount: mockUnreadCount })
    }
    return { unreadCount: mockUnreadCount }
  }),
}))

let mockUnreadCount = 0

// Mock navigation
const mockParentNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    getParent: () => ({ navigate: mockParentNavigate }),
  }),
}))

import { NotificationIndicator } from '@/components/NotificationIndicator'

describe('NotificationIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUnreadCount = 0
  })

  it('renders bell with unread badge count', () => {
    mockUnreadCount = 2

    const { getByText } = render(<NotificationIndicator />)

    expect(getByText('2')).toBeTruthy()
  })

  it('does not show badge when unread count is 0', () => {
    mockUnreadCount = 0

    const { queryByText } = render(<NotificationIndicator />)

    expect(queryByText('0')).toBeNull()
  })

  it('shows 99+ for large unread counts', () => {
    mockUnreadCount = 150

    const { getByText } = render(<NotificationIndicator />)

    expect(getByText('99+')).toBeTruthy()
  })

  it('navigates to Notifications tab on press', () => {
    mockUnreadCount = 3

    const { getByRole } = render(<NotificationIndicator />)

    fireEvent.press(getByRole('button'))

    expect(mockParentNavigate).toHaveBeenCalledWith('NotificationsTab')
  })
})
