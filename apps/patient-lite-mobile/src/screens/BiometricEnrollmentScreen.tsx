/**
 * BiometricEnrollmentScreen — Prompts first-time users to enroll biometrics.
 *
 * Story 18.2, Task 4: After successful OTP on first login,
 * offer fingerprint/face unlock enrollment.
 *
 * AC #5: Prompt to register fingerprint/face for subsequent logins.
 *        Enroll stores a flag in expo-secure-store.
 *        Skip does not re-prompt until next session.
 */
import { useCallback, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuthStore } from '@/stores/auth-store'
import { emitAuthAudit } from '@/lib/auth-audit'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

export interface BiometricEnrollmentScreenProps {
  onComplete: () => void
}

export function BiometricEnrollmentScreen({ onComplete }: BiometricEnrollmentScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const setBiometricEnrolled = useAuthStore((s) => s.setBiometricEnrolled)
  const userId = useAuthStore((s) => s.userId)
  const [enrolling, setEnrolling] = useState(false)

  const handleEnroll = useCallback(async () => {
    setEnrolling(true)
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()

      if (!hasHardware || !isEnrolled) {
        // No biometric hardware or not set up — audit and skip
        emitAuthAudit('PATIENT_BIOMETRIC_ENROLLED', 'failure', userId ?? undefined)
        onComplete()
        return
      }

      // Test biometric auth to confirm it works
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('auth.biometricPromptMessage'),
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      })

      if (result.success) {
        // Single source of truth: auth store persists biometric flag in AUTH_META_KEY
        setBiometricEnrolled()
        emitAuthAudit('PATIENT_BIOMETRIC_ENROLLED', 'success', userId ?? undefined)
      }
    } catch {
      // Enrollment failure is non-fatal — patient can still use the app
    } finally {
      setEnrolling(false)
      onComplete()
    }
  }, [t, setBiometricEnrolled, userId, onComplete])

  const handleSkip = useCallback(() => {
    // Don't re-prompt until next session (no persistent flag stored)
    onComplete()
  }, [onComplete])

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={styles.emoji}>🔐</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('auth.biometricPromptTitle')}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{t('auth.biometricPromptMessage')}</Text>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.enrollButton, { backgroundColor: colors.primary[500] }]}
          onPress={handleEnroll}
          disabled={enrolling}
          accessibilityRole="button"
          accessibilityLabel={t('auth.biometricEnroll')}
        >
          <Text style={[styles.enrollButtonText, { color: colors.onPrimary }]}>
            {enrolling ? t('common.loading') : t('auth.biometricEnroll')}
          </Text>
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={enrolling}
          accessibilityRole="button"
          accessibilityLabel={t('auth.biometricSkip')}
        >
          <Text style={[styles.skipButtonText, { color: colors.textMuted }]}>{t('auth.biometricSkip')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Check if biometric enrollment exists via the auth store.
 * Single source of truth — reads from AUTH_META_KEY in SecureStore.
 */
export function isBiometricEnrolled(): boolean {
  return useAuthStore.getState().biometricEnrolled
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  emoji: {
    fontSize: 64,
    marginBottom: consumerSpacing.lg,
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
    marginBottom: consumerSpacing.sm,
  },
  message: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: consumerSpacing.xl,
    maxWidth: 280,
  },
  buttonRow: {
    width: '100%',
    gap: consumerSpacing.sm,
  },
  enrollButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: consumerSpacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  enrollButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    // color applied inline via colors.onPrimary for dark mode support
  },
  skipButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: consumerSpacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: consumerTypography.bodySize,
  },
})
