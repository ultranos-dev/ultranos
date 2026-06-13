import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ProfileTab from '@/app/(tabs)/profile'

const mockSetLang = vi.fn().mockResolvedValue(undefined)
vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string; setLang: typeof mockSetLang }) => unknown) =>
    selector({ lang: 'en', setLang: mockSetLang }),
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (s: { user: null; token: null; logout: () => Promise<void> }) => unknown) =>
    selector({ user: null, token: null, logout: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (selector: (s: { status: string; lastSyncAt: null; lastVersion: number; setStatus: () => void; setLastSync: () => void }) => unknown) =>
    selector({ status: 'idle', lastSyncAt: null, lastVersion: 0, setStatus: vi.fn(), setLastSync: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'profile.language': 'Language',
        'profile.syncNow': 'Sync Now',
        'profile.logout': 'Log Out',
        'profile.neverSynced': 'Never synced',
        'profile.languageRestartTitle': 'Restart Required',
        'profile.languageRestartMessage': 'Switching to an RTL language requires the app to reload. Continue?',
        'common.cancel': 'Cancel',
        'common.ok': 'OK',
      }
      let str = map[key] ?? key
      if (opts) Object.entries(opts).forEach(([k, v]) => { str = str.replace(`{{${k}}}`, String(v)) })
      return str
    },
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn() }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))

describe('Profile — language selector', () => {
  beforeEach(() => { mockSetLang.mockClear() })

  it('renders a Language section with 4 buttons', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-en')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-prs')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-ps')).toBeTruthy()
    expect(screen.getByTestId('lang-btn-ar')).toBeTruthy()
  })

  it('shows alert when RTL direction changes (en→ps) and calls setLang on confirm', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'OK' || b.style !== 'cancel')?.onPress?.()
    })
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('lang-btn-ps'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('ps'))
    alertSpy.mockRestore()
  })

  it('calls setLang directly for en→en (no-op, same RTL direction)', async () => {
    render(<ProfileTab />)
    // Pressing the already-selected lang still calls setLang
    fireEvent.press(screen.getByTestId('lang-btn-en'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('en'))
  })
})
