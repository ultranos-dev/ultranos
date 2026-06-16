import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { Button } from '@ultranos/ui-kit/native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { AuthShell } from '@/components/AuthShell'

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  async function handleSignIn() {
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

  async function handleForgotPassword() {
    if (!email) { setError(t('login.resetEmail')); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (err) {
      setError(t('login.resetFailed'))
      void hapticNotification(NotificationFeedbackType.Error)
    } else {
      setError(null)
      setResetSent(true)
    }
  }

  return (
    <AuthShell title={t('login.memberTitle')} subtitle={t('login.memberSubtitle')} onBack={() => router.back()}>
      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
          <Text style={[styles.bannerText, { color: colors.dangerDark }]}>{error}</Text>
        </View>
      ) : null}
      {resetSent ? (
        <View style={[styles.banner, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
          <Text style={[styles.bannerText, { color: colors.successDark }]}>{t('login.resetSent')}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('login.email')}</Text>
        <TextInput
          testID="email-input"
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
          placeholder={t('login.email')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('login.password')}</Text>
        <TextInput
          testID="password-input"
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
          placeholder={t('login.password')}
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>
      <Pressable testID="forgot-password-button" onPress={handleForgotPassword} style={styles.forgotRow} accessibilityRole="button" accessibilityLabel={t('login.forgotPassword')}>
        <Text style={[styles.forgot, { color: colors.textMuted }]}>{t('login.forgotPassword')}</Text>
      </Pressable>
      <Button testID="login-button" label={t('login.logIn')} variant="primary" loading={loading} onPress={handleSignIn} />
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  bannerText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  forgotRow: { alignSelf: 'flex-end' },
  forgot: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
})
