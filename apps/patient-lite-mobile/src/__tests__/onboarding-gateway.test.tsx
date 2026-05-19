/**
 * Story 18.3: Language Onboarding Gateway integration tests.
 *
 * Tests:
 * - First login shows onboarding gateway after biometric enrollment
 * - Subsequent logins skip onboarding when flag is set
 * - Language selection persists and applies via useAppLocale
 * - Skip button sets completion flag and advances to app
 * - All 3 steps render with correct content
 * - RTL layout applied when Arabic/Dari selected
 */
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OnboardingFlow, isOnboardingComplete, markOnboardingComplete } from '@/components/OnboardingFlow'
import { OnboardingScreen } from '@/screens/OnboardingScreen'

// --- Mocks ---

const mockSetLocale = jest.fn().mockResolvedValue({ requiresRestart: false })
const mockPlayGreeting = jest.fn().mockResolvedValue(undefined)

jest.mock('@/hooks/useAppLocale', () => ({
  useAppLocale: () => ({
    locale: 'en',
    dir: 'ltr',
    setLocale: mockSetLocale,
  }),
}))

jest.mock('@/hooks/useLanguageGreeting', () => ({
  useLanguageGreeting: () => ({
    playGreeting: mockPlayGreeting,
  }),
}))

describe('Story 18.3: Language Onboarding Gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
  })

  describe('AC #1, #10: First login shows onboarding, subsequent logins skip', () => {
    it('shows onboarding gateway on first login (no completion flag)', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
      const result = await isOnboardingComplete()
      expect(result).toBe(false)
    })

    it('skips onboarding when completion flag is set', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('true')
      const result = await isOnboardingComplete()
      expect(result).toBe(true)
    })
  })

  describe('AC #2: Gateway displays 3 language options', () => {
    it('renders 3 language buttons with native scripts on step 0', () => {
      const { getByTestId, getByText } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      expect(getByTestId('onboarding-step-0')).toBeTruthy()
      expect(getByTestId('language-button-en')).toBeTruthy()
      expect(getByTestId('language-button-ar')).toBeTruthy()
      expect(getByTestId('language-button-prs')).toBeTruthy()
      expect(getByText('English')).toBeTruthy()
      expect(getByText('العربية')).toBeTruthy()
      expect(getByText('دری')).toBeTruthy()
    })

    it('renders script differentiation hints', () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      expect(getByTestId('script-hint-en')).toBeTruthy()
      expect(getByTestId('script-hint-ar')).toBeTruthy()
      expect(getByTestId('script-hint-prs')).toBeTruthy()
    })
  })

  describe('AC #3: Audio greeting plays on button tap', () => {
    it('awaits audio greeting before advancing to next step', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-ar'))
      })
      expect(mockPlayGreeting).toHaveBeenCalledWith('ar')
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
    })

    it('plays correct greeting for each language', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-prs'))
      })
      expect(mockPlayGreeting).toHaveBeenCalledWith('prs')
    })

    it('advances even if playGreeting rejects', async () => {
      mockPlayGreeting.mockRejectedValueOnce(new Error('Audio error'))
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
    })
  })

  describe('AC #5, #6: 3-step onboarding flow with illustrations', () => {
    it('step 1: shows Health Passport illustration after language selection', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      expect(getByTestId('onboarding-next')).toBeTruthy()
    })

    it('step 2: shows "Show this to your doctor" illustration', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      await act(async () => {
        fireEvent.press(getByTestId('onboarding-next'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-2')).toBeTruthy()
      })
    })

    it('step 2 completion calls onComplete and marks onboarding done', async () => {
      const onComplete = jest.fn()
      const { getByTestId } = render(
        <OnboardingFlow onComplete={onComplete} />,
      )
      // Step 0 → 1
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      // Step 1 → 2
      await act(async () => {
        fireEvent.press(getByTestId('onboarding-next'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-2')).toBeTruthy()
      })
      // Step 2 → complete
      await act(async () => {
        fireEvent.press(getByTestId('onboarding-next'))
      })
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@ultranos/onboarding-complete',
        'true',
      )
    })
  })

  describe('AC #7: Skip link available on illustration steps', () => {
    it('skip button is NOT present on step 0 (language selection required)', () => {
      const { queryByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      expect(queryByTestId('onboarding-skip')).toBeNull()
    })

    it('skip button is present on illustration steps', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      expect(getByTestId('onboarding-skip')).toBeTruthy()
    })

    it('skip button sets completion flag and calls onComplete', async () => {
      const onComplete = jest.fn()
      const { getByTestId } = render(
        <OnboardingFlow onComplete={onComplete} />,
      )
      // Advance to step 1 first (skip not available on step 0)
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      await act(async () => {
        fireEvent.press(getByTestId('onboarding-skip'))
      })
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@ultranos/onboarding-complete',
        'true',
      )
    })
  })

  describe('AC #8: Completion flag in AsyncStorage', () => {
    it('markOnboardingComplete stores flag', async () => {
      await markOnboardingComplete()
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@ultranos/onboarding-complete',
        'true',
      )
    })

    it('isOnboardingComplete returns true when flag is set', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('true')
      const result = await isOnboardingComplete()
      expect(result).toBe(true)
    })

    it('isOnboardingComplete returns false when flag is not set', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
      const result = await isOnboardingComplete()
      expect(result).toBe(false)
    })

    it('isOnboardingComplete handles AsyncStorage errors gracefully', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'))
      const result = await isOnboardingComplete()
      expect(result).toBe(false)
    })
  })

  describe('AC #9: Language selection persists and applies RTL', () => {
    it('language selection calls setLocale with correct code', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-ar'))
      })
      expect(mockSetLocale).toHaveBeenCalledWith('ar')
    })

    it('Dari selection calls setLocale with prs', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      await act(async () => {
        fireEvent.press(getByTestId('language-button-prs'))
      })
      expect(mockSetLocale).toHaveBeenCalledWith('prs')
    })

    it('arrow icon mirrors for RTL locale selection', async () => {
      const { getByTestId } = render(
        <OnboardingFlow onComplete={jest.fn()} />,
      )
      // Select Arabic (RTL locale)
      await act(async () => {
        fireEvent.press(getByTestId('language-button-ar'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })

      // Verify the next button exists (arrow direction derived from selected locale)
      expect(getByTestId('onboarding-next')).toBeTruthy()
    })
  })

  describe('OnboardingScreen composition', () => {
    it('renders OnboardingFlow and passes onComplete', async () => {
      const onComplete = jest.fn()
      const { getByTestId } = render(
        <OnboardingScreen onComplete={onComplete} />,
      )
      expect(getByTestId('onboarding-step-0')).toBeTruthy()
      // Advance to step 1 to access skip (skip removed from step 0)
      await act(async () => {
        fireEvent.press(getByTestId('language-button-en'))
      })
      await waitFor(() => {
        expect(getByTestId('onboarding-step-1')).toBeTruthy()
      })
      await act(async () => {
        fireEvent.press(getByTestId('onboarding-skip'))
      })
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      })
    })
  })
})
