import { useState, useEffect } from 'react'
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
import { WizardProgress } from '@/components/signup/WizardProgress'
import { PhotoPicker } from '@/components/signup/PhotoPicker'
import { ProvincePicker } from '@/components/signup/ProvincePicker'
import { DistrictPicker } from '@/components/signup/DistrictPicker'
import { uploadProfilePhoto } from '@/lib/profile-photo'

type Step = 'phone' | 'otp' | 'name' | 'photo' | 'address'
const ORDER: Step[] = ['phone', 'otp', 'name', 'photo', 'address']

export default function RegisterScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [given, setGiven] = useState('')
  const [family, setFamily] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const stepIndex = ORDER.indexOf(step)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleSendOtp() {
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); void hapticNotification(NotificationFeedbackType.Error); return }
    setCooldown(60)
    setStep('otp')
  }

  async function handleResendOtp() {
    if (cooldown > 0) return
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    if (err) { setError(err.message); void hapticNotification(NotificationFeedbackType.Error); return }
    setCooldown(60)
  }

  async function handleVerifyOtp() {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
    setLoading(false)
    if (err || !data.session) { setError(err?.message ?? t('signup.saveError')); void hapticNotification(NotificationFeedbackType.Error); return }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    setUserId(session.user.id)
    login(session.access_token, { sub: session.user.id, role: (meta['role'] as string) ?? 'PATIENT', facilityId: meta['facilityId'] as string | undefined })
    setStep('name')
  }

  async function handleFinish() {
    setLoading(true); setError(null)
    try {
      let photo_url: string | undefined
      if (photoUri) photo_url = await uploadProfilePhoto(photoUri, userId)
      const { error: err } = await supabase.auth.updateUser({
        data: { given_name: given, family_name: family, address: { province, district, village }, photo_url },
      })
      if (err) throw err
      router.replace('/(tabs)' as never)
    } catch {
      setError(t('signup.saveError'))
      void hapticNotification(NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    if (stepIndex > 0) setStep(ORDER[stepIndex - 1] as Step)
    else router.back()
  }

  const titles: Record<Step, { title: string; subtitle?: string }> = {
    phone: { title: t('signup.phoneTitle'), subtitle: t('signup.phoneSubtitle') },
    otp: { title: t('signup.codeTitle'), subtitle: t('register.enterCode', { phone }) },
    name: { title: t('signup.nameTitle') },
    photo: { title: t('signup.photoTitle'), subtitle: t('signup.photoSubtitle') },
    address: { title: t('signup.addressTitle') },
  }

  return (
    <AuthShell title={titles[step].title} subtitle={titles[step].subtitle} onBack={goBack}>
      <WizardProgress step={stepIndex + 1} total={ORDER.length} />
      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
          <Text style={[styles.bannerText, { color: colors.dangerDark }]}>{error}</Text>
        </View>
      ) : null}

      {step === 'phone' && (
        <>
          <TextInput testID="phone-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} placeholder={t('register.phone')} placeholderTextColor={colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" loading={loading} onPress={handleSendOtp} />
        </>
      )}

      {step === 'otp' && (
        <>
          <TextInput testID="otp-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} placeholder={t('register.sixDigitCode')} placeholderTextColor={colors.textMuted} value={otp} onChangeText={(x) => setOtp(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={6} />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" loading={loading} onPress={handleVerifyOtp} />
          <Pressable testID="wizard-resend" onPress={handleResendOtp} disabled={cooldown > 0} accessibilityRole="button" style={styles.skip}>
            <Text style={[styles.skipText, { color: cooldown > 0 ? colors.textMuted : colors.primary500 }]}>
              {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : t('register.resendCode')}
            </Text>
          </Pressable>
        </>
      )}

      {step === 'name' && (
        <>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.givenName')}</Text>
            <TextInput testID="given-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={given} onChangeText={setGiven} /></View>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.familyName')}</Text>
            <TextInput testID="family-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={family} onChangeText={setFamily} /></View>
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" disabled={!given.trim() || !family.trim()} onPress={() => setStep('photo')} />
        </>
      )}

      {step === 'photo' && (
        <>
          <PhotoPicker value={photoUri} onChange={setPhotoUri} />
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" onPress={() => setStep('address')} />
          <Pressable testID="wizard-skip" onPress={() => setStep('address')} accessibilityRole="button" style={styles.skip}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('signup.skip')}</Text>
          </Pressable>
        </>
      )}

      {step === 'address' && (
        <>
          <ProvincePicker value={province} onChange={(p) => { setProvince(p); setDistrict('') }} />
          <DistrictPicker province={province} value={district} onChange={setDistrict} />
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.village')}</Text>
            <TextInput testID="village-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={village} onChangeText={setVillage} /></View>
          <Button testID="wizard-finish" label={t('signup.finish')} variant="primary" loading={loading} disabled={!province || !district} onPress={handleFinish} />
        </>
      )}
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  bannerText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  skip: { alignSelf: 'center', paddingVertical: Spacing[2] },
  skipText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
})
