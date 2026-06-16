import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthShell } from '@/components/AuthShell'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))

describe('AuthShell', () => {
  it('renders the wordmark, title, subtitle, children, and footer', () => {
    const { getByText } = render(
      <AuthShell title="Sign in" subtitle="Use your account"><Text>form-here</Text></AuthShell>,
    )
    expect(getByText('Pharmopedia')).toBeTruthy()
    expect(getByText('Sign in')).toBeTruthy()
    expect(getByText('Use your account')).toBeTruthy()
    expect(getByText('form-here')).toBeTruthy()
    expect(getByText('common.poweredBy')).toBeTruthy()
  })

  it('shows a back control only when onBack is provided and fires it', () => {
    const onBack = vi.fn()
    const { getByTestId, queryByTestId, rerender } = render(<AuthShell title="T"><Text>x</Text></AuthShell>)
    expect(queryByTestId('auth-back')).toBeNull()
    rerender(<AuthShell title="T" onBack={onBack}><Text>x</Text></AuthShell>)
    fireEvent.press(getByTestId('auth-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
