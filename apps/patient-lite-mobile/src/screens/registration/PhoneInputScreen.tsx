/**
 * PhoneInputScreen — Phone number input for patient self-registration.
 *
 * Story 27.10, Task 4.1: Phone number input with MENA country code selector + "Send OTP" button.
 * AC #1: Collects phone number and sends OTP.
 * AC #8: No indication of whether phone exists (anti-enumeration).
 *
 * RTL: Phone input stays LTR (writingDirection: 'ltr') per Story dev notes.
 */
import { useCallback, useState } from 'react'
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
import { requestOtp } from '@/lib/registration-api'
import { emitAuthAudit } from '@/lib/auth-audit'

const COUNTRY_CODES = [
  { code: '+93', label: '\u{1F1E6}\u{1F1EB} +93', country: 'Afghanistan' },
  { code: '+971', label: '\u{1F1E6}\u{1F1EA} +971', country: 'UAE' },
  { code: '+966', label: '\u{1F1F8}\u{1F1E6} +966', country: 'KSA' },
  { code: '+962', label: '\u{1F1EF}\u{1F1F4} +962', country: 'Jordan' },
] as const

const PHONE_MAX_LENGTH = 15

export interface PhoneInputScreenProps {
  onOtpSent: (fullPhone: string) => void
}

export function PhoneInputScreen({ onOtpSent }: PhoneInputScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const [selectedCountryIndex, setSelectedCountryIndex] = useState(0)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullPhone = `${COUNTRY_CODES[selectedCountryIndex].code}${phoneNumber}`
  const isPhoneValid =
    phoneNumber.length >= 7 &&
    phoneNumber.length <= PHONE_MAX_LENGTH &&
    /^\d+$/.test(phoneNumber)

  const handleSendOtp = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      await requestOtp(fullPhone)
      emitAuthAudit('PATIENT_OTP_SENT', 'success')
      onOtpSent(fullPhone)
    } catch {
      setError(t('auth.sendError'))
      emitAuthAudit('PATIENT_OTP_SENT', 'failure')
    } finally {
      setLoading(false)
    }
  }, [fullPhone, t, onOtpSent])

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.languageRow}>
          <LanguageSelectorMobile />
        </View>

        <Text style={styles.welcomeEmoji}>{'\u{1F3E5}'}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('registration.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('registration.subtitle')}
        </Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('auth.phoneLabel')}
        </Text>
        <View style={styles.phoneRow}>
          <Pressable
            style={[
              styles.countryCodeButton,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
            accessibilityRole="button"
            accessibilityLabel="Select country code"
          >
            <Text style={[styles.countryCodeText, { color: colors.textPrimary }]}>
              {COUNTRY_CODES[selectedCountryIndex].label}
            </Text>
            <Text style={[styles.chevron, { color: colors.textMuted }]}>{'\u25BC'}</Text>
          </Pressable>

          <TextInput
            style={[
              styles.phoneInput,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={phoneNumber}
            onChangeText={(v) => setPhoneNumber(v.replace(/\D/g, '').slice(0, PHONE_MAX_LENGTH))}
            placeholder={t('auth.phonePlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={PHONE_MAX_LENGTH}
            autoFocus
            accessibilityLabel={t('auth.phoneLabel')}
            writingDirection="ltr"
          />
        </View>

        {showCountryPicker && (
          <View
            style={[
              styles.countryPicker,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
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

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary[500] },
            (!isPhoneValid || loading) && styles.buttonDisabled,
          ]}
          onPress={handleSendOtp}
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
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingTop: consumerSpacing.xl,
    paddingBottom: consumerSpacing.xl,
  },
  languageRow: { alignItems: 'flex-end', marginBottom: consumerSpacing.xl },
  welcomeEmoji: { fontSize: 56, textAlign: 'center', marginBottom: consumerSpacing.md },
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
  countryCodeText: { fontSize: consumerTypography.bodySize },
  chevron: { fontSize: 10 },
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
  countryOptionText: { fontSize: consumerTypography.bodySize },
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
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    marginTop: consumerSpacing.sm,
  },
})
