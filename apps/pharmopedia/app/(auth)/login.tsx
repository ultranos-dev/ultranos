import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { LanguageChips } from '@/components/LanguageChips'

type Flow = 'clinical' | 'patient'
type OtpStep = 'phone' | 'code'

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [flow, setFlow] = useState<Flow>('clinical')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<OtpStep>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClinicalLogin() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.loginFailed'))
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

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); void hapticNotification(NotificationFeedbackType.Error); return }
    setOtpStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.otpFailed'))
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
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('login.title')}</Text>

      {/* Flow toggle */}
      <View style={[styles.segmented, { borderColor: colors.primary500 }]}>
        <Pressable
          testID="clinical-tab"
          style={[styles.segment, { backgroundColor: colors.surface }, flow === 'clinical' && { backgroundColor: colors.primary500 }]}
          onPress={() => setFlow('clinical')}
        >
          <Text style={flow === 'clinical' ? [styles.segmentTextBase, { color: colors.white }] : [styles.segmentTextBase, { color: colors.primary500 }]}>
            {t('login.clinicalStaff')}
          </Text>
        </Pressable>
        <Pressable
          testID="patient-tab"
          style={[styles.segment, { backgroundColor: colors.surface }, flow === 'patient' && { backgroundColor: colors.primary500 }]}
          onPress={() => setFlow('patient')}
        >
          <Text style={flow === 'patient' ? [styles.segmentTextBase, { color: colors.white }] : [styles.segmentTextBase, { color: colors.primary500 }]}>
            {t('login.patient')}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      {flow === 'clinical' ? (
        <>
          <TextInput
            testID="email-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('login.email')}
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="password-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('login.password')}
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Pressable testID="login-button" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleClinicalLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>{t('login.logIn')}</Text>}
          </Pressable>
        </>
      ) : otpStep === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('login.phone')}
            placeholderTextColor={colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>{t('login.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('login.enterCode', { phone })}</Text>
          <TextInput
            testID="otp-input"
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('login.sixDigitCode')}
            placeholderTextColor={colors.textMuted}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>{t('login.verify')}</Text>}
          </Pressable>
          <Pressable onPress={() => setOtpStep('phone')}>
            <Text style={[styles.link, { color: colors.primary500 }]}>{t('login.back')}</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  segmented: { flexDirection: 'row', marginBottom: 24, borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentTextBase: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { fontWeight: '700', fontSize: 16 },
  error: { marginBottom: 12, textAlign: 'center' },
  hint: { marginBottom: 12, textAlign: 'center' },
  link: { textAlign: 'center', marginTop: 12 },
})
