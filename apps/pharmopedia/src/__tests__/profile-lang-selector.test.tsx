import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
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
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, source: 'none', loading: false }) }))

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

  it('shows confirm dialog when RTL direction changes (en→ps) and calls setLang on confirm', async () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('lang-btn-ps'))
    // RTL direction change → themed confirm dialog, not an immediate switch
    expect(screen.getByTestId('lang-restart-dialog')).toBeTruthy()
    expect(mockSetLang).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('lang-restart-dialog-confirm'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('ps'))
  })

  it('does not switch language when the RTL confirm dialog is cancelled', async () => {
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('lang-btn-ps'))
    fireEvent.press(screen.getByTestId('lang-restart-dialog-cancel'))
    await waitFor(() => expect(screen.queryByTestId('lang-restart-dialog')).toBeNull())
    expect(mockSetLang).not.toHaveBeenCalled()
  })

  it('calls setLang directly for en→en (no-op, same RTL direction)', async () => {
    render(<ProfileTab />)
    // Pressing the already-selected lang still calls setLang
    fireEvent.press(screen.getByTestId('lang-btn-en'))
    await waitFor(() => expect(mockSetLang).toHaveBeenCalledWith('en'))
  })
})
