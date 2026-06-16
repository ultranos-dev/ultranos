import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import ProfileTab from '@/app/(tabs)/profile'
import { useThemeStore } from '@/store/theme-store'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

vi.mock('react-native-safe-area-context', () => {
  const React = require('react')
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) =>
      React.createElement('SafeAreaView', props, children),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (s: { user: null; token: null; logout: () => Promise<void> }) => unknown) =>
    selector({ user: null, token: null, logout: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (selector: (s: { status: string; lastSyncAt: null; lastVersion: number; setStatus: () => void; setLastSync: () => void; setSyncedCount: () => void }) => unknown) =>
    selector({ status: 'idle', lastSyncAt: null, lastVersion: 0, setStatus: vi.fn(), setLastSync: vi.fn(), setSyncedCount: vi.fn() }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (selector: (s: { lang: string; setLang: () => void }) => unknown) =>
    selector({ lang: 'en', setLang: vi.fn() }),
  isRtlLang: () => false,
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn() }))
vi.mock('@/components/RoleBadge', () => ({ RoleBadge: () => null }))

describe('Profile — theme toggle', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })
  })

  it('renders the Profile title', () => {
    const { getByText } = render(<ProfileTab />)
    expect(getByText('tabs.profile')).toBeTruthy()
  })

  it('renders appearance section with three options', () => {
    render(<ProfileTab />)
    expect(screen.getByText('profile.appearance')).toBeTruthy()
    expect(screen.getByText('profile.themeLight')).toBeTruthy()
    expect(screen.getByText('profile.themeDark')).toBeTruthy()
    expect(screen.getByText('profile.themeSystem')).toBeTruthy()
  })

  it('highlights the active mode', () => {
    useThemeStore.setState({ mode: 'dark', resolvedTheme: 'dark', initialized: true })
    render(<ProfileTab />)
    expect(screen.getByTestId('theme-dark')).toBeTruthy()
  })

  it('calls setMode when a theme option is pressed', () => {
    const setModeSpy = vi.fn().mockResolvedValue(undefined)
    useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true, setMode: setModeSpy })
    render(<ProfileTab />)
    fireEvent.press(screen.getByTestId('theme-dark'))
    expect(setModeSpy).toHaveBeenCalledWith('dark')
  })
})
