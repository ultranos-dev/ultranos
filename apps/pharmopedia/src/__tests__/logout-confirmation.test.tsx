import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogout = vi.hoisted(() => vi.fn())

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { role: 'DOCTOR', sub: '1' }, token: 'tok', logout: mockLogout, isAuthenticated: true }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'idle', lastSyncAt: '2026-01-01', lastVersion: 1, setStatus: vi.fn(), setLastSync: vi.fn(), setSyncedCount: vi.fn() }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ lang: 'en', setLang: vi.fn() }),
  isRtlLang: () => false,
}))

vi.mock('@/store/theme-store', () => ({
  useThemeStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ mode: 'light', setMode: vi.fn() }),
}))

vi.mock('@/store/coach-mark-store', () => ({
  useCoachMarkStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel({ shouldShow: () => false, dismissed: new Set<string>() }),
    { getState: () => ({ reset: vi.fn() }) },
  ),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', surfaceSubtle: '#f5f5f5', textPrimary: '#111', textSecondary: '#666',
    primary500: '#2e9e71', white: '#fff', border: '#e5e5e5',
    danger: '#dc2626', dangerLight: '#fee2e2', dangerDark: '#991b1b',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, source: 'none', loading: false }) }))
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn(), hapticSelection: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))
vi.mock('react-native-safe-area-context', () => {
  const React = require('react')
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) =>
      React.createElement('SafeAreaView', props, children),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  }
})

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import ProfileTab from '@/app/(tabs)/profile'

describe('Logout Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the themed confirm dialog on logout press', () => {
    render(<ProfileTab />)
    expect(screen.queryByTestId('logout-dialog')).toBeNull()
    fireEvent.press(screen.getByTestId('logout-button'))
    expect(screen.getByTestId('logout-dialog')).toBeTruthy()
    expect(screen.getByText('profile.logoutConfirmTitle')).toBeTruthy()
    expect(screen.getByText('profile.logoutConfirmMessage')).toBeTruthy()
  })

  it('does not call logout until confirmed', () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('logout-button'))
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('calls logout when the dialog is confirmed', async () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('logout-button'))
    fireEvent.press(screen.getByTestId('logout-dialog-confirm'))
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
  })

  it('dismisses without logging out when cancelled', async () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('logout-button'))
    fireEvent.press(screen.getByTestId('logout-dialog-cancel'))
    await waitFor(() => expect(screen.queryByTestId('logout-dialog')).toBeNull())
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
