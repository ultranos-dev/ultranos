/**
 * Story 11.7 Task 9: Simplified onboarding flow (AC #10).
 *
 * 3-step onboarding:
 * 1. Language selection (Visual Language Gateway)
 * 2. "This is your Health Passport" — large illustration
 * 3. "Show this to your doctor" — large illustration
 *
 * Each step: full-screen illustration (60%), 1-line text (20px+),
 * "Next" arrow button (icon-based).
 * Skip link for returning users.
 * Stores onboarding-complete flag in AsyncStorage.
 */

import { useState, useCallback, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, BackHandler } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { VisualLanguageGateway } from './VisualLanguageGateway'
import { useAppLocale } from '@/hooks/useAppLocale'
import { useLanguageGreeting } from '@/hooks/useLanguageGreeting'
import { useTheme } from '@/theme/ThemeProvider'
import { consumerBorderRadius, consumerTypography } from '@/theme/consumer'
import type { SupportedLocale } from '@/i18n'

const ONBOARDING_KEY = '@ultranos/onboarding-complete'

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY)
    return value === 'true'
  } catch {
    return false
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {
    // Non-critical — onboarding will show again next launch
  }
}

interface OnboardingFlowProps {
  onComplete: () => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [step, setStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedLocale, setSelectedLocale] = useState<SupportedLocale | null>(null)
  const { setLocale } = useAppLocale()
  const { playGreeting } = useLanguageGreeting()

  // P6: Android back button navigates back through onboarding steps
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) {
        setStep((prev) => prev - 1)
        return true
      }
      return false
    })
    return () => handler.remove()
  }, [step])

  // D1: Await audio greeting before advancing (AC #3)
  // P1: try/catch for unhandled rejection
  // P4: isProcessing guard for double-tap protection
  const handleLanguageSelect = useCallback(async (locale: SupportedLocale) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await playGreeting(locale)
      await setLocale(locale)
      setSelectedLocale(locale)
      setStep(1)
    } catch {
      // Non-critical — advance anyway so user isn't stuck
      setSelectedLocale(locale)
      setStep(1)
    } finally {
      setIsProcessing(false)
    }
  }, [setLocale, playGreeting, isProcessing])

  // P2: await markOnboardingComplete
  // P3: functional updater to avoid stale step
  // P4: isProcessing guard
  const handleNext = useCallback(async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setStep((prev) => {
      if (prev < 2) return prev + 1
      return prev
    })
    if (step >= 2) {
      await markOnboardingComplete()
      onComplete()
    }
    setIsProcessing(false)
  }, [step, onComplete, isProcessing])

  // P2: await markOnboardingComplete
  // P4: isProcessing guard
  const handleSkip = useCallback(async () => {
    if (isProcessing) return
    setIsProcessing(true)
    await markOnboardingComplete()
    onComplete()
  }, [onComplete, isProcessing])

  // Step 0: Language selection (D2: no Skip on this step)
  if (step === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]} testID="onboarding-step-0">
        <VisualLanguageGateway onSelect={handleLanguageSelect} disabled={isProcessing} />
      </View>
    )
  }

  // Steps 1-2: Illustration screens
  const isHealthPassport = step === 1
  const isFinalStep = step === 2

  // P7: Derive arrow direction from selected locale, not stale I18nManager.isRTL
  const isRTLLocale = selectedLocale === 'ar' || selectedLocale === 'prs'
  const arrowIcon = isRTLLocale ? '⬅️' : '➡️'

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID={`onboarding-step-${step}`}>
      {/* Skip link at top-end (AC #7: top-right LTR, top-left RTL) */}
      <View style={styles.skipRow}>
        <Pressable
          onPress={handleSkip}
          disabled={isProcessing}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
          testID="onboarding-skip"
        >
          <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      {/* Illustration area (60% of screen) */}
      <View style={styles.illustrationArea}>
        <Text style={styles.illustration}>
          {isHealthPassport ? '📱' : '🏥'}
        </Text>
        <Text style={styles.illustrationSub}>
          {isHealthPassport ? '🔒' : '👨‍⚕️'}
        </Text>
      </View>

      {/* Text (1 line, 20px+) */}
      <View style={styles.textArea}>
        <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
          {isHealthPassport ? t('onboarding.step2Title') : t('onboarding.step3Title')}
        </Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
          {isHealthPassport ? t('onboarding.step2Subtitle') : t('onboarding.step3Subtitle')}
        </Text>
      </View>

      {/* Page dots */}
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: colors.primary[200] },
              i === step && [styles.dotActive, { backgroundColor: colors.primary[500] }],
            ]}
          />
        ))}
      </View>

      {/* Next / Get Started button (icon-based, arrow mirrors in RTL) */}
      <Pressable
        onPress={handleNext}
        disabled={isProcessing}
        style={({ pressed }) => [
          styles.nextButton,
          { backgroundColor: colors.primary[500] },
          pressed && { backgroundColor: colors.primary[600] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isFinalStep ? t('onboarding.getStarted') : t('onboarding.next')}
        testID="onboarding-next"
      >
        <Text style={styles.nextIcon}>
          {isFinalStep ? '✅' : arrowIcon}
        </Text>
        <Text style={[styles.nextText, { color: colors.onPrimary }]}>
          {isFinalStep ? t('onboarding.getStarted') : t('onboarding.next')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  skipRow: {
    position: 'absolute',
    top: 56,
    end: 24,
    zIndex: 1,
  },
  illustrationArea: {
    flex: 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustration: {
    fontSize: 96,
    writingDirection: 'ltr',
  },
  illustrationSub: {
    fontSize: 48,
    marginTop: 12,
    writingDirection: 'ltr',
  },
  textArea: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: consumerBorderRadius.button,
    minWidth: 160,
    justifyContent: 'center',
    marginBottom: 16,
  },
  nextIcon: {
    fontSize: 20,
    writingDirection: 'ltr',
  },
  nextText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    // color applied inline via colors.onPrimary for dark mode support
  },
  skipButton: {
    padding: 12,
  },
  skipText: {
    fontSize: consumerTypography.captionSize,
    textDecorationLine: 'underline',
  },
})
