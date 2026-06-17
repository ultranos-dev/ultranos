/**
 * profile-rtl.test.tsx
 *
 * RTL snapshot tests for the refactored profile screen.
 * Snapshots a patient profile in LTR (en) and RTL (ar).
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'

// ── shared profile fixture ─────────────────────────────────────────────────
const PATIENT_PROFILE = {
  kind: 'patient' as const,
  displayName: 'Sara Ahmadi',
  givenName: 'Sara',
  phone: '+93700000000',
  gender: 'female',
  age: 36,
  bloodGroup: 'O+',
  currentAddress: { province: 'Kabul', district: 'Kabul 1', village: undefined },
  preferredLanguage: 'prs',
  tier: 'PREMIUM' as const,
}

// ── shared mock helpers ────────────────────────────────────────────────────

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: PATIENT_PROFILE, source: 'network', loading: false }),
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { role: 'PATIENT', sub: 'auth-1' }, token: 'tok', logout: vi.fn() }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'idle', lastSyncAt: null, lastVersion: 0, setStatus: vi.fn(), setLastSync: vi.fn(), setSyncedCount: vi.fn() }),
}))

// lang store is overridden per test below via a module-level factory
const mockLang = { lang: 'en', setLang: vi.fn() }
vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: typeof mockLang) => unknown) => sel(mockLang),
  isRtlLang: (lang: string) => lang === 'ar',
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

import ProfileTab from '@/app/(tabs)/profile'

describe('Profile screen — RTL snapshots', () => {
  it('LTR snapshot (lang=en)', () => {
    mockLang.lang = 'en'
    const { toJSON } = render(<ProfileTab />)
    expect(toJSON()).toMatchSnapshot()
  })

  it('RTL snapshot (lang=ar)', () => {
    mockLang.lang = 'ar'
    const { toJSON } = render(<ProfileTab />)
    expect(toJSON()).toMatchSnapshot()
  })
})
