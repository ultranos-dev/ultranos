/**
 * ProfileSetupScreen — Collects first name, date of birth, and preferred language.
 *
 * Story 27.10, Task 4.3: Profile data collection during self-registration.
 * AC #1: Collects first name, date of birth, preferred language.
 *
 * RTL: Name input supports RTL script entry (Arabic/Dari names).
 * Date picker uses locale-aware formatting.
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
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import type { SupportedLocale } from '@/i18n'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
  { code: 'prs', nativeLabel: '\u062F\u0631\u06CC' },
]

export interface ProfileSetupScreenProps {
  onComplete: (profile: {
    firstName: string
    dateOfBirth: string
    preferredLanguage: string
  }) => void
  onBack: () => void
}

export function ProfileSetupScreen({ onComplete, onBack }: ProfileSetupScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const [firstName, setFirstName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLocale>('en')
  const [error, setError] = useState<string | null>(null)

  const isDateFormatValid = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
  const isDateValid = isDateFormatValid && (() => {
    const [y, m, d] = dateOfBirth.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date <= new Date()
  })()
  const isFormValid = firstName.trim().length >= 1 && isDateValid

  const handleDateInput = useCallback((value: string) => {
    // Auto-format: insert dashes as user types digits
    const digits = value.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4)}`
    }
    if (digits.length > 6) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
    }
    setDateOfBirth(formatted)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!isFormValid) return
    setError(null)

    // Calendar date validation (P5: reject invalid dates like Feb 31)
    if (!isDateValid) {
      setError(t('registration.invalidDate'))
      return
    }

    onComplete({
      firstName: firstName.trim(),
      dateOfBirth,
      preferredLanguage: selectedLanguage,
    })
  }, [isFormValid, firstName, dateOfBirth, selectedLanguage, t, onComplete])

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
          {t('registration.profileTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('registration.profileSubtitle')}
        </Text>

        {/* First name */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('registration.firstNameLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('registration.firstNamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          maxLength={200}
          accessibilityLabel={t('registration.firstNameLabel')}
        />

        {/* Date of birth */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('registration.dobLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              borderColor: colors.border,
            },
          ]}
          value={dateOfBirth}
          onChangeText={handleDateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel={t('registration.dobLabel')}
          writingDirection="ltr"
        />

        {/* Preferred language */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('registration.languageLabel')}
        </Text>
        <View style={styles.languageRow}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              style={[
                styles.languageOption,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    selectedLanguage === lang.code
                      ? colors.primary[500]
                      : colors.surfaceElevated,
                },
              ]}
              onPress={() => setSelectedLanguage(lang.code)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedLanguage === lang.code }}
            >
              <Text
                style={[
                  styles.languageOptionText,
                  {
                    color:
                      selectedLanguage === lang.code
                        ? colors.onPrimary
                        : colors.textPrimary,
                  },
                ]}
              >
                {lang.nativeLabel}
              </Text>
            </Pressable>
          ))}
        </View>

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary[500] },
            !isFormValid && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!isFormValid}
          accessibilityRole="button"
          accessibilityLabel={t('registration.continue')}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            {t('registration.continue')}
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
  label: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: consumerSpacing.xs,
    marginTop: consumerSpacing.md,
  },
  input: {
    borderRadius: consumerBorderRadius.button,
    paddingHorizontal: consumerSpacing.md,
    paddingVertical: consumerSpacing.md,
    fontSize: consumerTypography.bodySize,
    borderWidth: 1,
  },
  languageRow: {
    flexDirection: 'row',
    gap: consumerSpacing.sm,
    flexWrap: 'wrap',
  },
  languageOption: {
    borderRadius: consumerBorderRadius.button,
    paddingHorizontal: consumerSpacing.lg,
    paddingVertical: consumerSpacing.md,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageOptionText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
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
    marginTop: consumerSpacing.xl,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
})
