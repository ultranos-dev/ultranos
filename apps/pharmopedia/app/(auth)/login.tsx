import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

type Flow = 'clinical' | 'patient'
type OtpStep = 'phone' | 'code'

export default function LoginScreen() {
  const { t } = useTranslation()
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
    if (err) { setError(err.message); return }
    setOtpStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.otpFailed'))
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>{t('login.title')}</Text>

      {/* Flow toggle */}
      <View style={styles.segmented}>
        <Pressable
          testID="clinical-tab"
          style={[styles.segment, flow === 'clinical' && styles.segmentActive]}
          onPress={() => setFlow('clinical')}
        >
          <Text style={flow === 'clinical' ? styles.segmentTextActive : styles.segmentText}>
            {t('login.clinicalStaff')}
          </Text>
        </Pressable>
        <Pressable
          testID="patient-tab"
          style={[styles.segment, flow === 'patient' && styles.segmentActive]}
          onPress={() => setFlow('patient')}
        >
          <Text style={flow === 'patient' ? styles.segmentTextActive : styles.segmentText}>
            {t('login.patient')}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {flow === 'clinical' ? (
        <>
          <TextInput
            testID="email-input"
            style={styles.input}
            placeholder={t('login.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="password-input"
            style={styles.input}
            placeholder={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Pressable testID="login-button" style={styles.button} onPress={handleClinicalLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.logIn')}</Text>}
          </Pressable>
        </>
      ) : otpStep === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder={t('login.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('login.enterCode', { phone })}</Text>
          <TextInput
            testID="otp-input"
            style={styles.input}
            placeholder={t('login.sixDigitCode')}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.verify')}</Text>}
          </Pressable>
          <Pressable onPress={() => setOtpStep('phone')}>
            <Text style={styles.link}>{t('login.back')}</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  segmented: { flexDirection: 'row', marginBottom: 24, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#2563eb' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  segmentActive: { backgroundColor: '#2563eb' },
  segmentText: { color: '#2563eb', fontWeight: '600' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#6b7280', marginBottom: 12, textAlign: 'center' },
  link: { color: '#2563eb', textAlign: 'center', marginTop: 12 },
})
