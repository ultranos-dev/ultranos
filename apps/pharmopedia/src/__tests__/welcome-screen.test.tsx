import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
const replace = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}))

// Note: The welcome screen is at app/welcome.tsx but uses @/ path alias
// We need to import it correctly
import WelcomeScreen from '../../app/welcome'

describe('WelcomeScreen', () => {
  it('renders app name and tagline', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('Pharmopedia')).toBeTruthy()
    expect(screen.getByText('welcome.tagline')).toBeTruthy()
  })

  it('renders Get Started button', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('welcome.getStarted')).toBeTruthy()
  })

  it('routes Get Started to the onboarding chooser', async () => {
    const { getByTestId } = render(<WelcomeScreen />)
    fireEvent.press(getByTestId('get-started-button'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/(auth)/onboarding'))
  })
})
