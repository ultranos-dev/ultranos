/**
 * BiometricSetupScreen — Biometric enrollment during self-registration.
 *
 * Story 27.10, Task 4.4 / Task 5: Biometric enrollment prompt with skip option.
 *
 * AC #4: Biometric unlock configured during first registration.
 * - Uses expo-local-authentication to check device capability.
 * - If no biometric hardware: auto-skips to completion.
 * - If user skips: sets a flag to remind them later in settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '@/stores/auth-store'
import { emitAuthAudit } from '@/lib/auth-audit'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

const BIOMETRIC_SKIP_KEY = 'ultranos_biometric_skipped'

export interface BiometricSetupScreenProps {
  onComplete: () => void
}

export function BiometricSetupScreen({ onComplete }: BiometricSetupScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const setBiometricEnrolled = useAuthStore((s) => s.setBiometricEnrolled)
  const userId = useAuthStore((s) => s.userId)
  const [enrolling, setEnrolling] = useState(false)
  const [checking, setChecking] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Task 5.1 + 5.5: Check device biometric capability — skip screen if no hardware
  useEffect(() => {
    ;(async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync()
        if (!hasHardware) {
          if (mountedRef.current) onComplete()
          return
        }
        const isEnrolled = await LocalAuthentication.isEnrolledAsync()
        if (!isEnrolled) {
          if (mountedRef.current) onComplete()
          return
        }
      } catch {
        if (mountedRef.current) onComplete()
        return
      }
      if (mountedRef.current) setChecking(false)
    })()
  }, [onComplete])

  // Task 5.2 + 5.3: Prompt user to enable biometric unlock
  const handleEnroll = useCallback(async () => {
    setEnrolling(true)
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('auth.biometricPromptMessage'),
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      })

      if (result.success) {
        setBiometricEnrolled()
        emitAuthAudit('PATIENT_BIOMETRIC_ENROLLED', 'success', userId ?? undefined)
      }
    } catch {
      // Non-fatal
    } finally {
      setEnrolling(false)
      onComplete()
    }
  }, [t, setBiometricEnrolled, userId, onComplete])

  // Task 5.4: If user skips, set a flag to remind them later (P6: use SecureStore)
  const handleSkip = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(BIOMETRIC_SKIP_KEY, 'true', {
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      })
    } catch {
      // Best effort
    }
    onComplete()
  }, [onComplete])

  if (checking) {
    return <View style={[styles.container, { backgroundColor: colors.surface }]} />
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={styles.emoji}>{'\u{1F510}'}</Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t('auth.biometricPromptTitle')}
      </Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {t('auth.biometricPromptMessage')}
      </Text>

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
          <Text style={[styles.skipButtonText, { color: colors.textMuted }]}>
            {t('auth.biometricSkip')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  emoji: { fontSize: 64, marginBottom: consumerSpacing.lg },
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
  buttonRow: { width: '100%', gap: consumerSpacing.sm },
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
  },
  skipButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: consumerSpacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  skipButtonText: { fontSize: consumerTypography.bodySize },
})
