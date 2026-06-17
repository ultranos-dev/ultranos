import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

const push = vi.fn()
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))
vi.mock('@/components/LanguageMenu', () => ({ LanguageMenu: () => null }))

import OnboardingScreen from '@/app/(auth)/onboarding'

describe('OnboardingScreen', () => {
  it('renders both choice cards', () => {
    const { getByText } = render(<OnboardingScreen />)
    expect(getByText('onboarding.memberTitle')).toBeTruthy()
    expect(getByText('onboarding.publicTitle')).toBeTruthy()
  })

  it('routes the member card to login and the public card to register', () => {
    const { getByTestId } = render(<OnboardingScreen />)
    fireEvent.press(getByTestId('onboarding-member'))
    expect(push).toHaveBeenCalledWith('/(auth)/login')
    fireEvent.press(getByTestId('onboarding-public'))
    expect(push).toHaveBeenCalledWith('/(auth)/register')
  })
})
