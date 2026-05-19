/**
 * OtpVerificationScreen — 6-digit OTP code entry for patient self-registration.
 *
 * Story 27.10, Task 4.2: 6-digit OTP code input with resend timer (60s cooldown).
 *
 * RTL: OTP digit boxes stay LTR per Story dev notes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { requestOtp } from '@/lib/registration-api'

const OTP_LENGTH = 6
/** OTP display timer — conservative estimate below Supabase Auth default.
 *  P11: Aligned with server-side expiry to avoid user confusion. */
const OTP_EXPIRY_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

export interface OtpVerificationScreenProps {
  phone: string
  onVerified: (otpCode: string) => void
  onBack: () => void
}

export function OtpVerificationScreen({
  phone,
  onVerified,
  onBack,
}: OtpVerificationScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const otpInputRefs = useRef<(TextInput | null)[]>([])

  const [otpExpiryEnd, setOtpExpiryEnd] = useState(Date.now() + OTP_EXPIRY_MS)
  const [resendCooldownEnd, setResendCooldownEnd] = useState(Date.now() + RESEND_COOLDOWN_MS)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
  }, [])

  const otpSecondsLeft = Math.max(0, Math.ceil((otpExpiryEnd - now) / 1000))
  const otpExpired = otpSecondsLeft <= 0
  const resendSecondsLeft = Math.max(0, Math.ceil((resendCooldownEnd - now) / 1000))
  const canResend = resendSecondsLeft <= 0

  const handleOtpChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    setOtpDigits((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    if (digit && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus()
    }
  }, [])

  const handleOtpKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === 'Backspace' && !otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus()
      }
    },
    [otpDigits],
  )

  const handleVerify = useCallback(() => {
    const token = otpDigits.join('')
    if (token.length !== OTP_LENGTH) return
    setError(null)
    onVerified(token)
  }, [otpDigits, onVerified])

  const handleResend = useCallback(async () => {
    if (!canResend) return
    try {
      await requestOtp(phone)
      setOtpExpiryEnd(Date.now() + OTP_EXPIRY_MS)
      setResendCooldownEnd(Date.now() + RESEND_COOLDOWN_MS)
      setOtpDigits(Array(OTP_LENGTH).fill(''))
      setError(null)
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
    } catch {
      setError(t('auth.sendError'))
    }
  }, [canResend, phone, t])

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const secs = (totalSeconds % 60).toString().padStart(2, '0')
    return { minutes: mins, seconds: secs }
  }

  const { minutes, seconds } = formatCountdown(otpSecondsLeft)

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={[styles.backButton, { color: colors.primary[500] }]}>
            {'<'} {t('common.back')}
          </Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('auth.verifyTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('auth.verifySubtitle')}
        </Text>

        <View style={styles.otpRow}>
          {otpDigits.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => {
                otpInputRefs.current[i] = ref
              }}
              style={[
                styles.otpInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                },
                error ? { borderColor: colors.error } : null,
              ]}
              value={digit}
              onChangeText={(v) => handleOtpChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleOtpKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              accessibilityLabel={`Digit ${i + 1} of ${OTP_LENGTH}`}
              editable={!otpExpired}
              writingDirection="ltr"
            />
          ))}
        </View>

        {otpExpired ? (
          <Text style={[styles.expiredText, { color: colors.error }]}>
            {t('auth.expired')}
          </Text>
        ) : (
          <Text style={[styles.countdownText, { color: colors.textMuted }]}>
            {t('auth.expiresIn', { minutes, seconds })}
          </Text>
        )}

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary[500] },
            (otpDigits.join('').length < OTP_LENGTH || otpExpired) && styles.buttonDisabled,
          ]}
          onPress={handleVerify}
          disabled={otpDigits.join('').length < OTP_LENGTH || otpExpired}
          accessibilityRole="button"
          accessibilityLabel={t('auth.verifyButton')}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            {t('auth.verifyButton')}
          </Text>
        </Pressable>

        <View style={styles.resendRow}>
          <Pressable onPress={handleResend} disabled={!canResend} accessibilityRole="button">
            <Text
              style={[
                styles.linkText,
                { color: colors.primary[500] },
                !canResend && { color: colors.textMuted },
              ]}
            >
              {canResend
                ? t('auth.resend')
                : t('auth.resendIn', { seconds: resendSecondsLeft })}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingTop: consumerSpacing.xl,
    paddingBottom: consumerSpacing.xl,
  },
  backButton: {
    fontSize: consumerTypography.bodySize,
    marginBottom: consumerSpacing.lg,
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
    marginBottom: consumerSpacing.xs,
  },
  subtitle: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    marginBottom: consumerSpacing.xl,
    lineHeight: 22,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: consumerSpacing.sm,
    marginVertical: consumerSpacing.lg,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: consumerBorderRadius.button,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
  },
  countdownText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  expiredText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    marginTop: consumerSpacing.sm,
  },
  primaryButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: consumerSpacing.md,
    alignItems: 'center',
    marginTop: consumerSpacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: consumerSpacing.lg,
  },
  linkText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
})
