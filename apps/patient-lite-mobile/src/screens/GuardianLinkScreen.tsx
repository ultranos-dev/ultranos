/**
 * GuardianLinkScreen — Multi-step guardian linking flow.
 *
 * Story 18.7, Task 2: Guardian linking flow UI
 *
 * Steps:
 *   1. Info screen explaining what guardian linking does
 *   2. Phone number input for guardian (country code selector)
 *   3. OTP verification — guardian enters OTP on patient's device
 *   4. Confirmation — "Guardian linked successfully"
 *
 * AC #2: enter guardian's phone → verify via OTP → link established
 * AC #11: patient initiates, guardian only verifies via OTP
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { initiateGuardianLink, confirmGuardianLink } from '@/data/guardian-api'
import { emitAuditEvent } from '@/lib/audit'
import type { GuardianLink } from '@ultranos/shared-types'

// MENA region country codes — same as LoginScreen
const COUNTRY_CODES = [
  { code: '+93', label: '\u{1F1E6}\u{1F1EB} +93', country: 'Afghanistan' },
  { code: '+971', label: '\u{1F1E6}\u{1F1EA} +971', country: 'UAE' },
  { code: '+966', label: '\u{1F1F8}\u{1F1E6} +966', country: 'KSA' },
  { code: '+962', label: '\u{1F1EF}\u{1F1F4} +962', country: 'Jordan' },
] as const

const OTP_LENGTH = 6
const OTP_EXPIRY_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const PHONE_MAX_LENGTH = 15

type Step = 'info' | 'phone' | 'otp' | 'success'

export function GuardianLinkScreen() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const navigation = useNavigation()
  const { patient } = usePatientProfile()

  const [step, setStep] = useState<Step>('info')

  // Phone input
  const [selectedCountryIndex, setSelectedCountryIndex] = useState(0)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showCountryPicker, setShowCountryPicker] = useState(false)

  // OTP
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const otpInputRefs = useRef<(TextInput | null)[]>([])
  const [otpExpiryEnd, setOtpExpiryEnd] = useState(0)
  const [resendCooldownEnd, setResendCooldownEnd] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [lastOtpChannel, setLastOtpChannel] = useState<'sms' | 'whatsapp'>('sms')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedGuardian, setLinkedGuardian] = useState<GuardianLink | null>(null)

  const fullPhone = `${COUNTRY_CODES[selectedCountryIndex].code}${phoneNumber}`
  const isPhoneValid =
    phoneNumber.length >= 7 &&
    phoneNumber.length <= PHONE_MAX_LENGTH &&
    /^\d+$/.test(phoneNumber)

  // OTP countdown
  useEffect(() => {
    if (step !== 'otp') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [step])

  const otpSecondsLeft = Math.max(0, Math.ceil((otpExpiryEnd - now) / 1000))
  const otpExpired = step === 'otp' && otpSecondsLeft <= 0
  const resendSecondsLeft = Math.max(0, Math.ceil((resendCooldownEnd - now) / 1000))
  const canResend = resendSecondsLeft <= 0

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const secs = (totalSeconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  // --- Send OTP to guardian ---
  const sendOtp = useCallback(
    async (channel: 'sms' | 'whatsapp' = 'sms') => {
      if (!patient?.id) return
      setLoading(true)
      setError(null)

      try {
        await initiateGuardianLink(patient.id, fullPhone, channel)

        setLastOtpChannel(channel)
        setStep('otp')
        setOtpDigits(Array(OTP_LENGTH).fill(''))
        setOtpExpiryEnd(Date.now() + OTP_EXPIRY_MS)
        setResendCooldownEnd(Date.now() + RESEND_COOLDOWN_MS)
        setNow(Date.now())

        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
      } catch {
        setError(t('guardian.sendOtpError'))
      } finally {
        setLoading(false)
      }
    },
    [patient?.id, fullPhone, t],
  )

  // --- Verify OTP ---
  const verifyOtp = useCallback(async () => {
    const token = otpDigits.join('')
    if (token.length !== OTP_LENGTH || !patient?.id) return

    // Guard against expired OTP (race between countdown tick and submit)
    if (otpExpired) {
      setError(t('auth.expired'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const link = await confirmGuardianLink(patient.id, fullPhone, token, lastOtpChannel)
      setLinkedGuardian(link)

      emitAuditEvent({
        action: 'PHI_WRITE',
        resourceType: 'GuardianLink',
        resourceId: link.id,
        patientId: patient.id,
        outcome: 'success',
        metadata: { event: 'guardian_link_created' },
      })

      setStep('success')
    } catch {
      setError(t('guardian.verifyError'))
      setOtpDigits(Array(OTP_LENGTH).fill(''))
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
    } finally {
      setLoading(false)
    }
  }, [otpDigits, patient?.id, fullPhone, t, otpExpired, lastOtpChannel])

  // --- OTP digit handler ---
  const handleOtpChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    setOtpDigits((prev) => {
      const newDigits = [...prev]
      newDigits[index] = digit
      return newDigits
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

  // --- Step 1: Info ---
  if (step === 'info') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.surface }]}
        contentContainerStyle={styles.scrollContent}
        testID="guardian-link-info-step"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          testID="guardian-back-button"
        >
          <Text style={[styles.backButton, { color: colors.primary[500] }]}>{'<'} {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.icon}>{'🛡️'}</Text>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('guardian.infoTitle')}</Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.infoBody]}>
          {t('guardian.infoDescription')}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.infoCard]}>
          <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>{t('guardian.whatCanGuardianDo')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{'\u2022'} {t('guardian.canManageConsent')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{'\u2022'} {t('guardian.canViewHealth')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{'\u2022'} {t('guardian.cannotModifyClinical')}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.infoCard]}>
          <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>{t('guardian.howItWorks')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{t('guardian.howItWorksDescription')}</Text>
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary[500] }]}
          onPress={() => setStep('phone')}
          accessibilityRole="button"
          testID="guardian-continue-button"
        >
          <Text style={styles.primaryButtonText}>{t('guardian.continueToLink')}</Text>
        </Pressable>
      </ScrollView>
    )
  }

  // --- Step 2: Phone input ---
  if (step === 'phone') {
    return (
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: colors.surface }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          testID="guardian-link-phone-step"
        >
          <Pressable
            onPress={() => setStep('info')}
            accessibilityRole="button"
          >
            <Text style={[styles.backButton, { color: colors.primary[500] }]}>{'<'} {t('common.back')}</Text>
          </Pressable>

          <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('guardian.phoneTitle')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.subtitle]}>
            {t('guardian.phoneSubtitle')}
          </Text>

          {/* Country code + phone input */}
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('guardian.guardianPhone')}</Text>
          <View style={styles.phoneRow}>
            <Pressable
              style={[styles.countryCodeButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={() => setShowCountryPicker(!showCountryPicker)}
              accessibilityRole="button"
              accessibilityLabel="Select country code"
              testID="guardian-country-picker-button"
            >
              <Text style={[styles.countryCodeText, { color: colors.textPrimary }]}>
                {COUNTRY_CODES[selectedCountryIndex].label}
              </Text>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>{'\u25BC'}</Text>
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
              accessibilityLabel={t('guardian.guardianPhone')}
              testID="guardian-phone-input"
            />
          </View>

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

          {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.primary[500] }, (!isPhoneValid || loading) && styles.buttonDisabled]}
            onPress={() => sendOtp('sms')}
            disabled={!isPhoneValid || loading}
            accessibilityRole="button"
            testID="guardian-send-otp-button"
          >
            <Text style={styles.primaryButtonText}>
              {loading ? t('common.loading') : t('guardian.sendOtp')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // --- Step 3: OTP verification ---
  if (step === 'otp') {
    return (
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: colors.surface }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          testID="guardian-link-otp-step"
        >
          <Pressable
            onPress={() => {
              setStep('phone')
              setError(null)
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.backButton, { color: colors.primary[500] }]}>{'<'} {t('common.back')}</Text>
          </Pressable>

          <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('guardian.otpTitle')}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.subtitle]}>
            {t('guardian.otpSubtitle')}
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
                testID={`guardian-otp-digit-${i}`}
              />
            ))}
          </View>

          {otpExpired ? (
            <Text style={[styles.expiredText, { color: colors.error }]}>{t('auth.expired')}</Text>
          ) : (
            <Text style={[styles.countdownText, { color: colors.textMuted }]}>
              {t('auth.expiresIn', {
                minutes: formatCountdown(otpSecondsLeft).split(':')[0],
                seconds: formatCountdown(otpSecondsLeft).split(':')[1],
              })}
            </Text>
          )}

          {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

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
            testID="guardian-verify-otp-button"
          >
            <Text style={styles.primaryButtonText}>
              {loading ? t('common.loading') : t('guardian.verifyOtp')}
            </Text>
          </Pressable>

          {/* Resend / WhatsApp */}
          <View style={styles.resendRow}>
            <Pressable
              onPress={() => canResend && sendOtp(lastOtpChannel)}
              disabled={!canResend || loading}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.primary[500] }, !canResend && { color: colors.textMuted }]}>
                {canResend
                  ? t('auth.resend')
                  : t('auth.resendIn', { seconds: resendSecondsLeft })}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => canResend && sendOtp('whatsapp')}
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

  // --- Step 4: Success ---
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={[styles.scrollContent, styles.centered]}
      testID="guardian-link-success-step"
    >
      <Text style={styles.successIcon}>{'\u2705'}</Text>
      <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('guardian.successTitle')}</Text>
      <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.subtitle]}>
        {t('guardian.successDescription')}
      </Text>

      <Pressable
        style={[styles.primaryButton, { backgroundColor: colors.primary[500] }]}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        testID="guardian-done-button"
      >
        <Text style={styles.primaryButtonText}>{t('guardian.done')}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.md,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
  },
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
  },
  backButton: {
    fontSize: consumerTypography.bodySize,
    marginBottom: consumerSpacing.lg,
  },
  icon: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: consumerSpacing.md,
  },
  successIcon: {
    fontSize: 72,
    textAlign: 'center',
    marginBottom: consumerSpacing.lg,
  },
  infoBody: {
    marginBottom: consumerSpacing.md,
  },
  infoCard: {
    gap: consumerSpacing.sm,
  },
  subtitle: {
    marginBottom: consumerSpacing.lg,
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
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    marginTop: consumerSpacing.sm,
  },
})
