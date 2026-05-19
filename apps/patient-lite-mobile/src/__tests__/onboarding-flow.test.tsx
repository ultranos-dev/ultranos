import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OnboardingFlow, isOnboardingComplete, markOnboardingComplete } from '@/components/OnboardingFlow'

// Mock the hooks used by OnboardingFlow
jest.mock('@/hooks/useAppLocale', () => ({
  useAppLocale: () => ({
    locale: 'en',
    setLocale: jest.fn().mockResolvedValue({ requiresRestart: false }),
  }),
}))

jest.mock('@/hooks/useLanguageGreeting', () => ({
  useLanguageGreeting: () => ({
    playGreeting: jest.fn(),
  }),
}))

describe('OnboardingFlow', () => {
  const mockOnComplete = jest.fn()

  beforeEach(() => {
    mockOnComplete.mockClear()
    ;(AsyncStorage.getItem as jest.Mock).mockClear()
    ;(AsyncStorage.setItem as jest.Mock).mockClear()
  })

  it('starts at step 0 (language selection)', () => {
    const { getByTestId } = render(
      <OnboardingFlow onComplete={mockOnComplete} />,
    )
    expect(getByTestId('onboarding-step-0')).toBeTruthy()
    expect(getByTestId('visual-language-gateway')).toBeTruthy()
  })

  it('advances to step 1 after language selection', async () => {
    const { getByTestId } = render(
      <OnboardingFlow onComplete={mockOnComplete} />,
    )
    fireEvent.press(getByTestId('language-button-en'))

    await waitFor(() => {
      expect(getByTestId('onboarding-step-1')).toBeTruthy()
    })
  })

  it('skip button completes onboarding', () => {
    const { getByTestId } = render(
      <OnboardingFlow onComplete={mockOnComplete} />,
    )
    fireEvent.press(getByTestId('onboarding-skip'))
    expect(mockOnComplete).toHaveBeenCalled()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ultranos/onboarding-complete',
      'true',
    )
  })

  it('has maximum 3 steps', async () => {
    const { getByTestId } = render(
      <OnboardingFlow onComplete={mockOnComplete} />,
    )
    // Step 0 (language)
    expect(getByTestId('onboarding-step-0')).toBeTruthy()

    // Select language to advance
    fireEvent.press(getByTestId('language-button-en'))
    await waitFor(() => {
      expect(getByTestId('onboarding-step-1')).toBeTruthy()
    })

    // Step 1 → Step 2
    fireEvent.press(getByTestId('onboarding-next'))
    await waitFor(() => {
      expect(getByTestId('onboarding-step-2')).toBeTruthy()
    })

    // Step 2 → Complete
    fireEvent.press(getByTestId('onboarding-next'))
    expect(mockOnComplete).toHaveBeenCalled()
  })
})

describe('isOnboardingComplete', () => {
  it('returns false when no value stored', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    const result = await isOnboardingComplete()
    expect(result).toBe(false)
  })

  it('returns true when stored as "true"', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('true')
    const result = await isOnboardingComplete()
    expect(result).toBe(true)
  })
})

describe('markOnboardingComplete', () => {
  it('stores onboarding-complete flag', async () => {
    await markOnboardingComplete()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ultranos/onboarding-complete',
      'true',
    )
  })
})
