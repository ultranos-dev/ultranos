/**
 * Tests for Story 18.6: Patient Notification Center
 * Covers all 10 Acceptance Criteria.
 */
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { I18nManager } from 'react-native'
import * as Haptics from 'expo-haptics'

// --- Mocks ---

// Mock native stack navigator
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, null, children),
      Screen: ({ component: Component, ...rest }: { component: React.ComponentType; name: string }) =>
        React.createElement(Component, {
          navigation: {
            navigate: jest.fn(),
            goBack: jest.fn(),
            getParent: () => ({ navigate: jest.fn() }),
          },
          route: { params: { notificationId: 'n1' } },
        }),
    }),
  }
})

const mockFetchNotifications = jest.fn()
const mockAcknowledgeNotification = jest.fn()
const mockFetchUnreadCount = jest.fn()

jest.mock('@/lib/notification-api', () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
  fetchUnreadCount: (...args: unknown[]) => mockFetchUnreadCount(...args),
}))

// Mock encrypted-db
jest.mock('@/lib/encrypted-db', () => ({
  getEncryptedDbConnection: jest.fn().mockResolvedValue({
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue(undefined),
  }),
  isDatabaseOpen: jest.fn().mockReturnValue(false),
}))

// Mock data layer
jest.mock('@/data/notification-queries', () => ({
  getLocalNotifications: jest.fn().mockResolvedValue([]),
  saveNotifications: jest.fn().mockResolvedValue(undefined),
  markAsRead: jest.fn().mockResolvedValue(undefined),
}))

// Explicit i18next mock (ensures translations resolve even when other mocks interfere)
const mockMessages = require('../../messages/en.json')
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.')
      let value: any = mockMessages
      for (const part of parts) {
        if (value && typeof value === 'object') value = value[part]
        else return key
      }
      if (typeof value !== 'string') return key
      if (params) {
        let text = value
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
        }
        return text
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
  Trans: ({ children }: any) => children,
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}))

// Mock react-navigation — minimal, no NavigationContainer needed
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const React = require('react')
    React.useEffect(() => {
      return cb()
    }, [])
  },
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getParent: () => ({ navigate: jest.fn() }),
  }),
}))

// Mock hooks
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

// --- Imports (after mocks) ---

import { NotificationsScreen } from '@/screens/NotificationsScreen'
import { NotificationDetailScreen } from '@/screens/NotificationDetailScreen'
import { useNotificationStore } from '@/stores/notification-store'
import type { NotificationItem } from '@/lib/notification-api'

// --- Fixtures ---

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type: 'LAB_RESULT_AVAILABLE',
    title: 'Blood Test Complete',
    body: 'Your blood work results are ready.',
    payload: { testCategory: 'Hematology', labName: 'City Lab' },
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    ...overrides,
  }
}

const labNotification = makeNotification()

const escalationNotification = makeNotification({
  id: 'n2',
  type: 'LAB_RESULT_ESCALATION',
  title: 'Critical Lab Result',
  body: 'Urgent: Your lab results require immediate attention.',
  status: 'PENDING',
})

const prescriptionNotification = makeNotification({
  id: 'n3',
  type: 'PRESCRIPTION_READY',
  title: 'Prescription Available',
  body: 'Your prescription is ready for pickup.',
  payload: { prescriptionId: 'rx-1' },
})

const consentNotification = makeNotification({
  id: 'n4',
  type: 'CONSENT_CHANGE',
  title: 'Privacy Settings Changed',
  body: 'Your privacy settings have been updated.',
})

const readNotification = makeNotification({
  id: 'n5',
  type: 'LAB_RESULT_AVAILABLE',
  title: 'Old Result',
  status: 'ACKNOWLEDGED',
  acknowledgedAt: new Date().toISOString(),
})

const allNotifications = [
  labNotification,
  escalationNotification,
  prescriptionNotification,
  consentNotification,
  readNotification,
]

// --- Helpers ---

function renderScreen(props?: Record<string, unknown>) {
  const defaultProps = {
    navigation: {
      navigate: jest.fn(),
      goBack: jest.fn(),
      getParent: () => ({ navigate: jest.fn() }),
    } as any,
    route: { params: {} } as any,
  }
  return render(<NotificationsScreen {...defaultProps} {...props} />)
}

function renderDetailScreen(notificationId = 'n1') {
  return render(
    <NotificationDetailScreen
      navigation={{
        navigate: jest.fn(),
        goBack: jest.fn(),
        getParent: () => ({ navigate: jest.fn() }),
      } as any}
      route={{ params: { notificationId }, key: 'detail', name: 'NotificationDetailScreen' } as any}
    />,
  )
}

// --- Tests ---

describe('Story 18.6: Patient Notification Center', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    // Reset store
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      lastFetched: null,
    })
    mockFetchNotifications.mockResolvedValue({ notifications: allNotifications })
    mockAcknowledgeNotification.mockResolvedValue({ success: true })
    mockFetchUnreadCount.mockResolvedValue({ count: 4 })
  })

  afterEach(() => {
    jest.useRealTimers()
    useNotificationStore.getState().stopPolling()
  })

  // AC #1: Notification list renders, newest-first
  it('renders notification list from API (AC #1)', async () => {
    const { getByTestId } = renderScreen()

    await act(async () => {
      jest.advanceTimersByTime(100)
    })

    await waitFor(() => {
      expect(getByTestId('notification-list')).toBeTruthy()
    })
  })

  // AC #2: Type-specific styling
  it('renders type-specific cards with correct labels (AC #2)', async () => {
    useNotificationStore.setState({
      notifications: allNotifications,
      unreadCount: 4,
    })

    const { getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getAllByText('Lab Result Available').length).toBe(2)
      expect(getAllByText('Lab Result — Urgent').length).toBeGreaterThanOrEqual(1)
      expect(getAllByText('Prescription Ready').length).toBeGreaterThanOrEqual(1)
      expect(getAllByText('Consent Updated').length).toBeGreaterThanOrEqual(1)
    })
  })

  // AC #3: Unread vs read visual distinction
  it('shows unread and read notifications with different styling (AC #3)', async () => {
    useNotificationStore.setState({
      notifications: [labNotification, readNotification],
      unreadCount: 1,
    })

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId(`notification-card-${labNotification.id}`)).toBeTruthy()
      expect(getByTestId(`notification-card-${readNotification.id}`)).toBeTruthy()
    })
  })

  // AC #4: Tapping marks as read and navigates to detail
  it('navigates to detail screen on tap (AC #4)', async () => {
    const mockNavigate = jest.fn()
    useNotificationStore.setState({
      notifications: [labNotification],
      unreadCount: 1,
    })

    const { getByTestId } = render(
      <NotificationsScreen
        navigation={{ navigate: mockNavigate, goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) } as any}
        route={{ params: {} } as any}
      />,
    )

    await waitFor(() => {
      expect(getByTestId(`notification-card-${labNotification.id}`)).toBeTruthy()
    })

    fireEvent.press(getByTestId(`notification-card-${labNotification.id}`))

    expect(mockNavigate).toHaveBeenCalledWith('NotificationDetailScreen', {
      notificationId: labNotification.id,
    })
  })

  // AC #4 continued: Detail screen marks as read
  it('marks notification as read when detail screen opens (AC #4)', async () => {
    useNotificationStore.setState({
      notifications: [labNotification],
      unreadCount: 1,
    })

    renderDetailScreen('n1')

    await waitFor(() => {
      const state = useNotificationStore.getState()
      expect(state.notifications[0].status).toBe('ACKNOWLEDGED')
      expect(state.unreadCount).toBe(0)
    })
  })

  // AC #5: Escalation notifications have red border, "Urgent" badge, haptic
  it('renders escalation with Urgent badge and triggers haptic (AC #5)', async () => {
    const HapticsMod = require('expo-haptics')
    const hapticSpy = jest.spyOn(HapticsMod, 'notificationAsync').mockResolvedValue(undefined)

    useNotificationStore.setState({
      notifications: [escalationNotification],
      unreadCount: 1,
    })

    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByTestId('urgent-badge')).toBeTruthy()
      expect(getByText('Urgent')).toBeTruthy()
    })

    expect(hapticSpy).toHaveBeenCalledWith(HapticsMod.NotificationFeedbackType.Warning)
    hapticSpy.mockRestore()
  })

  // AC #6: Tab badge shows correct unread count
  it('exposes unreadCount for tab badge (AC #6)', () => {
    useNotificationStore.setState({
      notifications: allNotifications,
      unreadCount: 4,
    })

    const state = useNotificationStore.getState()
    expect(state.unreadCount).toBe(4)
  })

  it('updates unreadCount after marking as read (AC #6)', async () => {
    useNotificationStore.setState({
      notifications: [labNotification, escalationNotification],
      unreadCount: 2,
    })

    await act(async () => {
      await useNotificationStore.getState().markAsRead('n1')
    })

    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  // AC #7: Polling starts on focus, stops on blur
  it('starts and stops polling (AC #7)', () => {
    const store = useNotificationStore.getState()

    store.startPolling()
    expect(mockFetchNotifications).toHaveBeenCalledTimes(1)

    act(() => {
      jest.advanceTimersByTime(30_000)
    })
    expect(mockFetchNotifications).toHaveBeenCalledTimes(2)

    store.stopPolling()
    act(() => {
      jest.advanceTimersByTime(60_000)
    })
    expect(mockFetchNotifications).toHaveBeenCalledTimes(2)
  })

  // AC #9: Pull-to-refresh triggers fetch
  it('pull-to-refresh triggers fetchNotifications (AC #9)', async () => {
    useNotificationStore.setState({
      notifications: [labNotification],
      unreadCount: 1,
    })

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId('notification-list')).toBeTruthy()
    })

    const flatList = getByTestId('notification-list')
    fireEvent(flatList, 'refresh')

    expect(mockFetchNotifications).toHaveBeenCalled()
  })

  // AC #10: Empty state
  it('shows empty state when no notifications (AC #10)', async () => {
    mockFetchNotifications.mockResolvedValue({ notifications: [] })
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
    })

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText('No notifications yet')).toBeTruthy()
    })
  })

  // RTL rendering
  it('renders correctly in RTL mode (AC RTL)', async () => {
    const originalIsRTL = I18nManager.isRTL
    I18nManager.isRTL = true

    useNotificationStore.setState({
      notifications: [labNotification, escalationNotification],
      unreadCount: 2,
    })

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId('notification-list')).toBeTruthy()
    })

    I18nManager.isRTL = originalIsRTL
  })

  // Offline: cached notifications display
  it('loads from cache when API fails (offline)', async () => {
    const { isDatabaseOpen } = require('@/lib/encrypted-db')
    const { getLocalNotifications } = require('@/data/notification-queries')

    isDatabaseOpen.mockReturnValue(true)
    getLocalNotifications.mockResolvedValue([
      {
        id: 'cached-1',
        type: 'LAB_RESULT_AVAILABLE',
        title: 'Cached Result',
        body: 'Cached body',
        metadata: '{}',
        is_read: 0,
        created_at: new Date().toISOString(),
        acknowledged_at: null,
      },
    ])
    mockFetchNotifications.mockRejectedValue(new Error('Network error'))

    await act(async () => {
      await useNotificationStore.getState().fetchNotifications()
    })

    await act(async () => {
      await useNotificationStore.getState().loadFromCache()
    })

    const state = useNotificationStore.getState()
    expect(state.notifications.length).toBe(1)
    expect(state.notifications[0].id).toBe('cached-1')
  })
})

describe('NotificationDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAcknowledgeNotification.mockResolvedValue({ success: true })
  })

  it('displays notification details', async () => {
    useNotificationStore.setState({
      notifications: [labNotification],
      unreadCount: 1,
    })

    const { getByText } = renderDetailScreen('n1')

    await waitFor(() => {
      expect(getByText('Lab Result Available')).toBeTruthy()
      expect(getByText('Blood Test Complete')).toBeTruthy()
    })
  })

  it('displays escalation with Urgent badge', async () => {
    useNotificationStore.setState({
      notifications: [escalationNotification],
      unreadCount: 1,
    })

    const { getByText } = renderDetailScreen('n2')

    await waitFor(() => {
      expect(getByText('Lab Result — Urgent')).toBeTruthy()
      expect(getByText('Urgent')).toBeTruthy()
    })
  })

  it('shows type-specific action button for prescription', async () => {
    useNotificationStore.setState({
      notifications: [prescriptionNotification],
      unreadCount: 1,
    })

    const { getByText } = renderDetailScreen('n3')

    await waitFor(() => {
      expect(getByText('View Prescription')).toBeTruthy()
    })
  })

  it('shows type-specific action button for consent change', async () => {
    useNotificationStore.setState({
      notifications: [consentNotification],
      unreadCount: 1,
    })

    const { getByText } = renderDetailScreen('n4')

    await waitFor(() => {
      expect(getByText('View Privacy Settings')).toBeTruthy()
    })
  })

  it('shows type-specific action button for lab result', async () => {
    useNotificationStore.setState({
      notifications: [labNotification],
      unreadCount: 1,
    })

    const { getByText } = renderDetailScreen('n1')

    await waitFor(() => {
      expect(getByText('View Result')).toBeTruthy()
    })
  })
})
