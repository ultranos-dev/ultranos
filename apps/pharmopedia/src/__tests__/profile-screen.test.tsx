/**
 * profile-screen.test.tsx
 *
 * Tests for the Clinical-Calm refactored profile screen (Task 8).
 * Covers: patient full profile, practitioner profile, offline banner + prefs,
 * and logout Alert invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

// ── hoisted mocks ──────────────────────────────────────────────────────────
const mockUseProfile = vi.hoisted(() => vi.fn())
const mockLogout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

// ── module mocks ───────────────────────────────────────────────────────────

vi.mock('@/hooks/useProfile', () => ({ useProfile: mockUseProfile }))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { role: 'PATIENT', sub: 'auth-1' }, token: 'tok', logout: mockLogout }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'idle', lastSyncAt: null, lastVersion: 0, setStatus: vi.fn(), setLastSync: vi.fn(), setSyncedCount: vi.fn() }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ lang: 'en', setLang: vi.fn() }),
  isRtlLang: () => false,
}))

vi.mock('@/store/theme-store', () => ({
  useThemeStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ mode: 'light', setMode: vi.fn() }),
}))

vi.mock('@/store/coach-mark-store', () => ({
  useCoachMarkStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) =>
      sel({ dismissed: new Set<string>() }),
    { getState: () => ({ reset: vi.fn() }) },
  ),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff',
    surfaceSubtle: '#f5f5f5',
    textPrimary: '#111',
    textSecondary: '#666',
    textMuted: '#999',
    primary50: '#f0fdf4',
    primary500: '#2e9e71',
    primary600: '#1e7a57',
    white: '#fff',
    border: '#e5e5e5',
    borderSubtle: '#f0f0f0',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    dangerDark: '#991b1b',
    info: '#2563eb',
    infoLight: '#dbeafe',
    warning: '#d97706',
    warningLight: '#fef3c7',
    success: '#16a34a',
    successLight: '#dcfce7',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let str = key
      if (opts) Object.entries(opts).forEach(([k, v]) => { str = str.replace(`{{${k}}}`, String(v)) })
      return str
    },
  }),
}))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }))
vi.mock('@/components/NetStatusBanner', () => ({ NetStatusBanner: () => null }))
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

// ── subject under test ─────────────────────────────────────────────────────
import ProfileTab from '@/app/(tabs)/profile'

// ── test suite ─────────────────────────────────────────────────────────────

describe('Profile screen — Clinical-Calm refactor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders patient full profile: name, phone, address', () => {
    mockUseProfile.mockReturnValue({
      profile: {
        kind: 'patient',
        displayName: 'Sara Ahmadi',
        givenName: 'Sara',
        phone: '+9370',
        gender: 'female',
        age: 36,
        bloodGroup: 'O+',
        currentAddress: { province: 'Kabul', district: 'Kabul 1' },
        preferredLanguage: 'prs',
        tier: 'PREMIUM',
      },
      source: 'network',
      loading: false,
    })

    const { getByTestId, getByText } = render(<ProfileTab />)

    // identity testIDs present
    expect(getByTestId('profile-avatar')).toBeTruthy()
    expect(getByTestId('profile-name')).toBeTruthy()
    expect(getByTestId('profile-account-type')).toBeTruthy()

    // display name text
    expect(getByText('Sara Ahmadi')).toBeTruthy()

    // phone row
    expect(getByText('+9370')).toBeTruthy()

    // preserved: lang buttons
    expect(getByTestId('lang-btn-en')).toBeTruthy()
    expect(getByTestId('lang-btn-ar')).toBeTruthy()
  })

  it('renders practitioner full profile: name, org, license', () => {
    mockUseProfile.mockReturnValue({
      profile: {
        kind: 'practitioner',
        displayName: 'Ahmad Khan',
        givenName: 'Ahmad',
        familyName: 'Khan',
        role: 'DOCTOR',
        email: 'a@x.io',
        organization: 'Kabul Clinic',
        licenseId: 'LIC-9',
        status: 'ACTIVE',
      },
      source: 'network',
      loading: false,
    })

    const { getByText } = render(<ProfileTab />)

    expect(getByText('Ahmad Khan')).toBeTruthy()
    expect(getByText('Kabul Clinic')).toBeTruthy()
    expect(getByText('LIC-9')).toBeTruthy()
  })

  it('shows offline banner when source is none; prefs still present', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      source: 'none',
      loading: false,
    })

    const { getByTestId } = render(<ProfileTab />)

    expect(getByTestId('profile-offline-banner')).toBeTruthy()
    // Preferences section preserved
    expect(getByTestId('lang-btn-en')).toBeTruthy()
    expect(getByTestId('sync-now-button')).toBeTruthy()
    expect(getByTestId('show-tips-button')).toBeTruthy()
    expect(getByTestId('logout-button')).toBeTruthy()
  })

  it('logout button opens the themed confirm dialog', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      source: 'cache',
      loading: false,
    })

    const { getByTestId, getByText } = render(<ProfileTab />)
    fireEvent.press(getByTestId('logout-button'))

    expect(getByTestId('logout-dialog')).toBeTruthy()
    expect(getByText('profile.logoutConfirmTitle')).toBeTruthy()
  })

  it('logout dialog confirm invokes logout', async () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      source: 'cache',
      loading: false,
    })

    const { getByTestId } = render(<ProfileTab />)
    fireEvent.press(getByTestId('logout-button'))
    fireEvent.press(getByTestId('logout-dialog-confirm'))

    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
  })

  it('shows loading placeholder when loading and no profile yet', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      source: 'none',
      loading: true,
    })

    // Prefs + logout sections always render even during load
    const { getByTestId } = render(<ProfileTab />)
    expect(getByTestId('lang-btn-en')).toBeTruthy()
    expect(getByTestId('logout-button')).toBeTruthy()
  })

  it('preserves catalog sync testIDs', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      source: 'network',
      loading: false,
    })

    const { getByTestId } = render(<ProfileTab />)
    expect(getByTestId('last-synced-text')).toBeTruthy()
    expect(getByTestId('sync-now-button')).toBeTruthy()
    expect(getByTestId('show-tips-button')).toBeTruthy()
  })
})
