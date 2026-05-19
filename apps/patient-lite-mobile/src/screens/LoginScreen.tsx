/**
 * LoginScreen — OTP-based phone authentication for patients.
 *
 * Story 18.2, Task 3: Two-phase login flow:
 *   Phase 1: Phone number input with MENA country code selector
 *   Phase 2: 6-digit OTP entry with auto-advance, countdown, retry
 *
 * AC #1: Country code selector with MENA defaults
 * AC #3: 6-digit OTP with auto-focus, auto-advance, 10-min expiry
 * AC #8: Retry with 60s cooldown + "Try WhatsApp" option
 * AC #9: Generic error messages (no credential enumeration)
 * AC #10: Language selector accessible pre-auth
 * AC #12: Phone number never logged or stored locally
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
import { LanguageSelectorMobile } from '@/components/LanguageSelectorMobile'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { emitAuthAudit } from '@/lib/auth-audit'

// MENA region country codes (AC #1)
const COUNTRY_CODES = [
  { code: '+93', label: '🇦🇫 +93', country: 'Afghanistan' },
  { code: '+971', label: '🇦🇪 +971', country: 'UAE' },
  { code: '+966', label: '🇸🇦 +966', country: 'KSA' },
  { code: '+962', label: '🇯🇴 +962', country: 'Jordan' },
] as const

const OTP_LENGTH = 6
const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
const SESSION_DURATION_DAYS = 90
const PHONE_MAX_LENGTH = 15 // E.164 maximum

export interface LoginScreenProps {
  onLoginSuccess: (userId: string, isFirstLogin: boolean) => void
}

type Phase = 'phone' | 'otp'

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const setSession = useAuthStore((s) => s.setSession)

  // Phone input state
  const [selectedCountryIndex, setSelectedCountryIndex] = useState(0)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showCountryPicker, setShowCountryPicker] = useState(false)

  // OTP state
  const [phase, setPhase] = useState<Phase>('phone')
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const otpInputRefs = useRef<(TextInput | null)[]>([])

  // Timers
  const [otpExpiryEnd, setOtpExpiryEnd] = useState<number>(0)
  const [resendCooldownEnd, setResendCooldownEnd] = useState<number>(0)
  const [now, setNow] = useState(Date.now())

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOtpChannel, setLastOtpChannel] = useState<'sms' | 'whatsapp'>('sms')

  // Tick timer for countdowns
  useEffect(() => {
    if (phase !== 'otp') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [phase])

  const fullPhone = `${COUNTRY_CODES[selectedCountryIndex].code}${phoneNumber}`

  // Derived countdown values
  const otpSecondsLeft = Math.max(0, Math.ceil((otpExpiryEnd - now) / 1000))
  const otpExpired = phase === 'otp' && otpSecondsLeft <= 0
  const resendSecondsLeft = Math.max(0, Math.ceil((resendCooldownEnd - now) / 1000))
  const canResend = resendSecondsLeft <= 0

  const isPhoneValid = phoneNumber.length >= 7 && phoneNumber.length <= PHONE_MAX_LENGTH && /^\d+$/.test(phoneNumber)

  // --- Send OTP ---
  const sendOtp = useCallback(
    async (channel: 'sms' | 'whatsapp' = 'sms') => {
      setLoading(true)
      setError(null)

      try {
        const otpOptions: Parameters<typeof supabase.auth.signInWithOtp>[0] = {
          phone: fullPhone,
          ...(channel === 'whatsapp' ? { options: { channel: 'whatsapp' } } : {}),
        }

        const { error: otpError } = await supabase.auth.signInWithOtp(otpOptions)

        if (otpError) {
          // AC #9: Generic error — no credential enumeration
          setError(t('auth.sendError'))
          emitAuthAudit('PATIENT_OTP_SENT', 'failure')
          return
        }

        emitAuthAudit('PATIENT_OTP_SENT', 'success')
        setLastOtpChannel(channel)
        setPhase('otp')
        setOtpDigits(Array(OTP_LENGTH).fill(''))
        setOtpExpiryEnd(Date.now() + OTP_EXPIRY_MS)
        setResendCooldownEnd(Date.now() + RESEND_COOLDOWN_MS)
        setNow(Date.now())

        // Auto-focus first OTP input
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
      } catch {
        setError(t('auth.sendError'))
        emitAuthAudit('PATIENT_OTP_SENT', 'failure')
      } finally {
        setLoading(false)
      }
    },
    [fullPhone, t],
  )

  // --- Verify OTP ---
  const verifyOtp = useCallback(async () => {
    const token = otpDigits.join('')
    if (token.length !== OTP_LENGTH) return

    setLoading(true)
    setError(null)

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token,
        type: 'sms',
      })

      if (verifyError || !data.session) {
        // AC #9: Generic error
        setError(t('auth.verifyError'))
        emitAuthAudit('PATIENT_LOGIN_FAILURE', 'failure')
        setOtpDigits(Array(OTP_LENGTH).fill(''))
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
        return
      }

      const userId = data.session.user.id
      // Determine if first login: created_at === last_sign_in_at (within a few seconds)
      const createdAt = new Date(data.session.user.created_at).getTime()
      const lastSignIn = data.session.user.last_sign_in_at
        ? new Date(data.session.user.last_sign_in_at).getTime()
        : createdAt
      const isFirstLogin = Math.abs(lastSignIn - createdAt) < 5000

      // 90-day session expiry (AC #4)
      const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()

      setSession(userId, expiresAt, isFirstLogin)
      emitAuthAudit('PATIENT_LOGIN_SUCCESS', 'success', userId)
      onLoginSuccess(userId, isFirstLogin)
    } catch {
      setError(t('auth.verifyError'))
      emitAuthAudit('PATIENT_LOGIN_FAILURE', 'failure')
    } finally {
      setLoading(false)
    }
  }, [otpDigits, fullPhone, t, setSession, onLoginSuccess])

  // --- OTP digit input handler ---
  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      // Only allow single digits
      const digit = value.replace(/\D/g, '').slice(-1)

      setOtpDigits((prev) => {
        const newDigits = [...prev]
        newDigits[index] = digit
        return newDigits
      })

      // Auto-advance to next input
      if (digit && index < OTP_LENGTH - 1) {
        otpInputRefs.current[index + 1]?.focus()
      }
    },
    [],
  )

  const handleOtpKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === 'Backspace' && !otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus()
      }
    },
    [otpDigits],
  )

  // --- Resend OTP ---
  const handleResend = useCallback(() => {
    if (!canResend) return
    sendOtp(lastOtpChannel)
  }, [canResend, sendOtp, lastOtpChannel])

  const handleTryWhatsApp = useCallback(() => {
    if (!canResend) return
    sendOtp('whatsapp')
  }, [canResend, sendOtp])

  // --- Back to phone input ---
  const handleBackToPhone = useCallback(() => {
    setPhase('phone')
    setError(null)
    setOtpDigits(Array(OTP_LENGTH).fill(''))
  }, [])

  // Format countdown
  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0')
    const secs = (totalSeconds % 60).toString().padStart(2, '0')
    return { minutes: mins, seconds: secs }
  }

  // ---- RENDER ----

  if (phase === 'otp') {
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
          {/* Language selector (AC #10) */}
          <View style={styles.languageRow}>
            <LanguageSelectorMobile />
          </View>

          <Pressable onPress={handleBackToPhone} accessibilityRole="button">
            <Text style={[styles.backButton, { color: colors.primary[500] }]}>{'<'} {t('common.back')}</Text>
          </Pressable>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('auth.verifyTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth.verifySubtitle')}</Text>

          {/* OTP digit inputs (AC #3) */}
          <View style={styles.otpRow}>
            {otpDigits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => {
                  otpInputRefs.current[i] = ref
                }}
                style={[
                  styles.otpInput,
                  { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary },
                  error ? { borderColor: colors.error } : null,
                ]}
                value={digit}
                onChangeText={(v) => handleOtpChange(i, v)}
                onKeyPress={({ nativeEvent }) => handleOtpKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                accessibilityLabel={`Digit ${i + 1} of ${OTP_LENGTH}`}
                editable={!loading && !otpExpired}
              />
            ))}
          </View>

          {/* Expiry countdown */}
          {otpExpired ? (
            <Text style={[styles.expiredText, { color: colors.error }]}>{t('auth.expired')}</Text>
          ) : (
            <Text style={[styles.countdownText, { color: colors.textMuted }]}>
              {t('auth.expiresIn', { minutes, seconds })}
            </Text>
          )}

          {/* Error */}
          {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

          {/* Verify button */}
          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary[500] },
              (loading || otpDigits.join('').length < OTP_LENGTH || otpExpired) &&
                styles.buttonDisabled,
            ]}
            onPress={verifyOtp}
            disabled={loading || otpDigits.join('').length < OTP_LENGTH || otpExpired}
            accessibilityRole="button"
            accessibilityLabel={t('auth.verifyButton')}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              {loading ? t('common.loading') : t('auth.verifyButton')}
            </Text>
          </Pressable>

          {/* Resend / WhatsApp (AC #8) */}
          <View style={styles.resendRow}>
            <Pressable
              onPress={handleResend}
              disabled={!canResend || loading}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.primary[500] }, !canResend && { color: colors.textMuted }]}>
                {canResend ? t('auth.resend') : t('auth.resendIn', { seconds: resendSecondsLeft })}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleTryWhatsApp}
              disabled={!canResend || loading}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.primary[500] }, !canResend && { color: colors.textMuted }]}>
                {t('auth.tryWhatsApp')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // Phase: phone input
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language selector (AC #10) */}
        <View style={styles.languageRow}>
          <LanguageSelectorMobile />
        </View>

        <Text style={styles.welcomeEmoji}>🏥</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('auth.welcomeTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth.welcomeSubtitle')}</Text>

        {/* Country code selector + phone input (AC #1) */}
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('auth.phoneLabel')}</Text>
        <View style={styles.phoneRow}>
          <Pressable
            style={[styles.countryCodeButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
            accessibilityRole="button"
            accessibilityLabel="Select country code"
          >
            <Text style={[styles.countryCodeText, { color: colors.textPrimary }]}>
              {COUNTRY_CODES[selectedCountryIndex].label}
            </Text>
            <Text style={[styles.chevron, { color: colors.textMuted }]}>{'▼'}</Text>
          </Pressable>

          <TextInput
            style={[styles.phoneInput, { backgroundColor: colors.surfaceElevated, color: colors.textPrimary, borderColor: colors.border }]}
            value={phoneNumber}
            onChangeText={(v) => setPhoneNumber(v.replace(/\D/g, '').slice(0, PHONE_MAX_LENGTH))}
            placeholder={t('auth.phonePlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={PHONE_MAX_LENGTH}
            autoFocus
            accessibilityLabel={t('auth.phoneLabel')}
          />
        </View>

        {/* Country code picker dropdown */}
        {showCountryPicker && (
          <View style={[styles.countryPicker, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            {COUNTRY_CODES.map((cc, index) => (
              <Pressable
                key={cc.code}
                style={[
                  styles.countryOption,
                  index === selectedCountryIndex && { backgroundColor: colors.primary[50] },
                ]}
                onPress={() => {
                  setSelectedCountryIndex(index)
                  setShowCountryPicker(false)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: index === selectedCountryIndex }}
              >
                <Text style={[styles.countryOptionText, { color: colors.textPrimary }]}>
                  {cc.label} {cc.country}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Error */}
        {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        {/* Send OTP button */}
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary[500] }, (!isPhoneValid || loading) && styles.buttonDisabled]}
          onPress={() => sendOtp('sms')}
          disabled={!isPhoneValid || loading}
          accessibilityRole="button"
          accessibilityLabel={t('auth.sendOtp')}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            {loading ? t('common.loading') : t('auth.sendOtp')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingTop: consumerSpacing.xl,
    paddingBottom: consumerSpacing.xl,
  },
  languageRow: {
    alignItems: 'flex-end',
    marginBottom: consumerSpacing.xl,
  },
  welcomeEmoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: consumerSpacing.md,
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
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: consumerSpacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: consumerSpacing.md,
    gap: consumerSpacing.xs,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: consumerBorderRadius.button,
    paddingHorizontal: consumerSpacing.md,
    paddingVertical: consumerSpacing.md,
    borderWidth: 1,
    gap: 4,
  },
  countryCodeText: {
    fontSize: consumerTypography.bodySize,
  },
  chevron: {
    fontSize: 10,
  },
  phoneInput: {
    flex: 1,
    borderRadius: consumerBorderRadius.button,
    paddingHorizontal: consumerSpacing.md,
    paddingVertical: consumerSpacing.md,
    fontSize: consumerTypography.bodySize,
    borderWidth: 1,
  },
  countryPicker: {
    borderRadius: consumerBorderRadius.card,
    marginBottom: consumerSpacing.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  countryOption: {
    paddingVertical: consumerSpacing.md,
    paddingHorizontal: consumerSpacing.md,
  },
  countryOptionText: {
    fontSize: consumerTypography.bodySize,
  },
  primaryButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: consumerSpacing.md,
    alignItems: 'center',
    marginTop: consumerSpacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    marginTop: consumerSpacing.sm,
  },
  // OTP phase styles
  backButton: {
    fontSize: consumerTypography.bodySize,
    marginBottom: consumerSpacing.lg,
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: consumerSpacing.lg,
  },
  linkText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
})
