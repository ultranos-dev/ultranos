import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'
import { TabNavigator } from '@/navigation/TabNavigator'
import { TAB_DEFINITIONS } from '@/config/icon-vocabulary'

// Mock native stack navigator to avoid react-native-screens native deps
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, null, children),
      Screen: ({ component: Component }: { component: React.ComponentType }) =>
        React.createElement(Component),
    }),
  }
})

// Mock notification API
jest.mock('@/lib/notification-api', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
  fetchNotifications: jest.fn().mockResolvedValue({ notifications: [] }),
  acknowledgeNotification: jest.fn().mockResolvedValue(undefined),
}))

// Mock hooks that depend on native modules
jest.mock('@/hooks/usePatientProfile', () => ({
  usePatientProfile: () => ({
    patient: null,
    isLoading: true,
    error: null,
    refresh: jest.fn(),
  }),
}))

jest.mock('@/hooks/useConsentSettings', () => ({
  useConsentSettings: () => ({
    categories: [],
    consentHistory: [],
    isLoading: true,
    error: null,
    toggleConsent: jest.fn(),
  }),
}))

jest.mock('@/hooks/useMedicalHistory', () => ({
  useMedicalHistory: () => ({
    events: [],
    activeMedications: [],
    isLoading: true,
    error: null,
    refresh: jest.fn(),
  }),
}))

jest.mock('@/components/PatientQRCode', () => ({
  PatientQRCode: () => null,
}))

const { fetchUnreadCount } = require('@/lib/notification-api')

function renderWithProviders() {
  return render(
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>,
  )
}

describe('TabNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchUnreadCount.mockResolvedValue({ count: 0 })
  })

  it('renders all 4 tabs', async () => {
    const { getByText } = renderWithProviders()

    await waitFor(() => {
      for (const tab of TAB_DEFINITIONS) {
        // Use translated label text to find tabs since testIDs may vary by react-navigation version
        const label = {
          passport: 'My Passport',
          timeline: 'Timeline',
          privacy: 'Privacy',
          notifications: 'Notifications',
        }[tab.key]
        expect(getByText(label!)).toBeTruthy()
      }
    })
  })

  it('renders passport, timeline, privacy, and notifications tabs', async () => {
    const { getByText } = renderWithProviders()

    await waitFor(() => {
      expect(getByText('My Passport')).toBeTruthy()
      expect(getByText('Timeline')).toBeTruthy()
      expect(getByText('Privacy')).toBeTruthy()
      expect(getByText('Notifications')).toBeTruthy()
    })
  })

  it('navigates between tabs on press', async () => {
    const { getByText, getByTestId } = renderWithProviders()

    await waitFor(() => {
      expect(getByText('My Passport')).toBeTruthy()
    })

    // Navigate to timeline
    await act(async () => {
      fireEvent.press(getByText('Timeline'))
    })

    // Navigate to notifications
    await act(async () => {
      fireEvent.press(getByText('Notifications'))
    })

    await waitFor(() => {
      expect(getByTestId('notifications-screen')).toBeTruthy()
    })
  })

  it('shows notification badge when unread count > 0', async () => {
    fetchUnreadCount.mockResolvedValue({ count: 5 })

    const { findByText } = renderWithProviders()

    await waitFor(() => {
      expect(fetchUnreadCount).toHaveBeenCalled()
    })

    const badge = await findByText('5')
    expect(badge).toBeTruthy()
  })

  it('does not show badge when unread count is 0', async () => {
    fetchUnreadCount.mockResolvedValue({ count: 0 })

    const { queryByText } = renderWithProviders()

    await waitFor(() => {
      expect(fetchUnreadCount).toHaveBeenCalled()
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(queryByText('0')).toBeNull()
  })

  it('shows 99+ for large unread counts', async () => {
    fetchUnreadCount.mockResolvedValue({ count: 150 })

    const { findByText } = renderWithProviders()

    await waitFor(() => {
      expect(fetchUnreadCount).toHaveBeenCalled()
    })

    const badge = await findByText('99+')
    expect(badge).toBeTruthy()
  })

  it('tab labels are translated', async () => {
    const { getByText } = renderWithProviders()

    await waitFor(() => {
      expect(getByText('My Passport')).toBeTruthy()
      expect(getByText('Timeline')).toBeTruthy()
      expect(getByText('Privacy')).toBeTruthy()
      expect(getByText('Notifications')).toBeTruthy()
    })
  })
})
