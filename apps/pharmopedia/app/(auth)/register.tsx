import { useState } from 'react'
import {
  Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { LanguageChips } from '@/components/LanguageChips'

type Step = 'phone' | 'code'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const colors = useThemeColors()

  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); void hapticNotification(NotificationFeedbackType.Error); return }
    setStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('register.otpFailed'))
      void hapticNotification(NotificationFeedbackType.Error)
      return
    }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    login(session.access_token, {
      sub: session.user.id,
      role: (meta['role'] as string) ?? 'PATIENT',
      facilityId: meta['facilityId'] as string | undefined,
    })
    router.replace('/(tabs)' as never)
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LanguageChips />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('register.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('register.subtitle')}</Text>

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {step === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('register.phone')}
            placeholderTextColor={colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('register.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('register.enterCode', { phone })}</Text>
          <TextInput
            testID="otp-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('register.sixDigitCode')}
            placeholderTextColor={colors.textMuted}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('register.verify')}</Text>}
          </Pressable>
          <Pressable testID="register-back-button" onPress={() => setStep('phone')}>
            <Text style={[styles.link, { color: colors.primary500 }]}>{t('register.back')}</Text>
          </Pressable>
        </>
      )}

      <Pressable testID="sign-in-link" onPress={() => router.push('/login' as never)}>
        <Text style={[styles.link, { color: colors.primary500 }]}>{t('register.signIn')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: Spacing[6] },
  title: { fontSize: 28, fontFamily: FontFamily.headingBold, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: FontFamily.sans, textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    fontFamily: FontFamily.sans,
  },
  button: { borderRadius: Radius.md, padding: 14, alignItems: 'center' as const, marginTop: Spacing[2] },
  buttonText: { color: '#ffffff', fontFamily: FontFamily.sansBold, fontSize: 16 },
  error: { marginBottom: 12, textAlign: 'center' as const, fontFamily: FontFamily.sans },
  hint: { marginBottom: 12, textAlign: 'center' as const, fontFamily: FontFamily.sans },
  link: { textAlign: 'center' as const, marginTop: 12, fontFamily: FontFamily.sans },
})
