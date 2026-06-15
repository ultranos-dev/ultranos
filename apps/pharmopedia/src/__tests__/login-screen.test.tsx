import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import LoginScreen from '@/app/(auth)/login'

const mockPush = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: mockPush }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: { login: () => void }) => unknown) => sel({ login: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('LoginScreen — register link', () => {
  it('renders register-link that navigates to /register', () => {
    render(<LoginScreen />)
    const link = screen.getByTestId('register-link')
    expect(link).toBeTruthy()
    fireEvent.press(link)
    expect(mockPush).toHaveBeenCalledWith('/register')
  })
})
