import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore } from '@/store/lang-store'
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
import { discoverAccount, claimAccount, registerFromSession } from '@/api/account'
import type { DiscoverAccountResult } from '@/api/account'

// Steps in the no-match (new registration) path, used for progress display.
type NoMatchStep = 'phone' | 'otp' | 'name' | 'dob' | 'photo' | 'address'
const NO_MATCH_ORDER: NoMatchStep[] = ['phone', 'otp', 'name', 'dob', 'photo', 'address']

// All possible wizard steps including discovery branches.
type Step = NoMatchStep | 'staff' | 'claim'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const token = useAuthStore((s) => s.token)
  const lang = useLangStore((s) => s.lang)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [given, setGiven] = useState('')
  const [family, setFamily] = useState('')
  const [dob, setDob] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // State for the discovery/claim branch
  const [discovery, setDiscovery] = useState<DiscoverAccountResult | null>(null)
  const [claimBirthYear, setClaimBirthYear] = useState('')

  // For progress: only show for no-match path steps
  const noMatchStepIndex = NO_MATCH_ORDER.indexOf(step as NoMatchStep)
  const progressStep = noMatchStepIndex >= 0 ? noMatchStepIndex + 1 : null
  const progressTotal = NO_MATCH_ORDER.length

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
    if (err || !data.session) {
      setLoading(false)
      setError(err?.message ?? t('signup.saveError'))
      void hapticNotification(NotificationFeedbackType.Error)
      return
    }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    setUserId(session.user.id)
    login(session.access_token, { sub: session.user.id, role: (meta['role'] as string) ?? 'PATIENT', facilityId: meta['facilityId'] as string | undefined })

    // Post-OTP: discover if phone matches an existing patient or staff record
    try {
      const result = await discoverAccount(session.access_token, { phone })
      setDiscovery(result)
      if (result.matchType === 'staff') {
        setLoading(false)
        setStep('staff')
      } else if (result.matchType === 'patient') {
        setLoading(false)
        setStep('claim')
      } else {
        setLoading(false)
        setStep('name')
      }
    } catch {
      // Discovery failed — fall through to normal registration
      setLoading(false)
      setStep('name')
    }
  }

  async function handleStaffSignIn() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login' as never)
  }

  async function handleClaim() {
    if (!discovery?.candidate) return
    setLoading(true); setError(null)
    try {
      await claimAccount(token!, { ref: discovery.candidate.ref, phone, birthYear: Number(claimBirthYear) })
      router.replace('/(tabs)' as never)
    } catch {
      setError(t('signup.claimMismatch'))
      void hapticNotification(NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
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
      // Also register in the Hub as a linked patient record
      await registerFromSession(token!, {
        firstName: given,
        nameFather: family || undefined,
        dateOfBirth: dob,
        preferredLanguage: lang,
        addressProvinceCurrent: province || undefined,
        addressDistrictCurrent: district || undefined,
        addressVillageCurrent: village || undefined,
        photoUrl: photo_url,
      })
      router.replace('/(tabs)' as never)
    } catch {
      setError(t('signup.saveError'))
      void hapticNotification(NotificationFeedbackType.Error)
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    if (step === 'staff' || step === 'claim') {
      // Return to OTP step
      setStep('otp')
      return
    }
    const idx = NO_MATCH_ORDER.indexOf(step as NoMatchStep)
    if (idx > 0) setStep(NO_MATCH_ORDER[idx - 1] as Step)
    else router.back()
  }

  // Title map for no-match path steps only
  const noMatchTitles: Record<NoMatchStep, { title: string; subtitle?: string }> = {
    phone: { title: t('signup.phoneTitle'), subtitle: t('signup.phoneSubtitle') },
    otp: { title: t('signup.codeTitle'), subtitle: t('register.enterCode', { phone }) },
    name: { title: t('signup.nameTitle') },
    dob: { title: t('signup.dob') },
    photo: { title: t('signup.photoTitle'), subtitle: t('signup.photoSubtitle') },
    address: { title: t('signup.addressTitle') },
  }

  const branchTitles: Record<'staff' | 'claim', { title: string; subtitle?: string }> = {
    staff: { title: t('signup.staffMatchTitle') },
    claim: { title: t('signup.foundAccountTitle') },
  }

  const currentTitle = (step === 'staff' || step === 'claim')
    ? branchTitles[step]
    : noMatchTitles[step as NoMatchStep]

  return (
    <AuthShell title={currentTitle.title} subtitle={currentTitle.subtitle} onBack={goBack}>
      {progressStep !== null && (
        <WizardProgress step={progressStep} total={progressTotal} />
      )}
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

      {step === 'staff' && (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{t('signup.staffMatchBody')}</Text>
          <Button testID="wizard-staff-signin" label={t('signup.goToMemberLogin')} variant="primary" loading={loading} onPress={handleStaffSignIn} />
        </>
      )}

      {step === 'claim' && (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('signup.foundAccountBody', { name: discovery?.candidate?.maskedName ?? '' })}
          </Text>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.confirmBirthYear')}</Text>
            <TextInput
              testID="claim-birthyear-input"
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
              placeholder={t('signup.birthYear')}
              placeholderTextColor={colors.textMuted}
              value={claimBirthYear}
              onChangeText={(x) => setClaimBirthYear(x.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <Button testID="wizard-claim" label={t('signup.claim')} variant="primary" loading={loading} disabled={claimBirthYear.length !== 4} onPress={handleClaim} />
        </>
      )}

      {step === 'name' && (
        <>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.givenName')}</Text>
            <TextInput testID="given-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={given} onChangeText={setGiven} /></View>
          <View style={styles.field}><Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.familyName')}</Text>
            <TextInput testID="family-name-input" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]} value={family} onChangeText={setFamily} /></View>
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" disabled={!given.trim() || !family.trim()} onPress={() => setStep('dob')} />
        </>
      )}

      {step === 'dob' && (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('signup.dob')}</Text>
            <TextInput
              testID="dob-input"
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={dob}
              onChangeText={setDob}
            />
          </View>
          <Button testID="wizard-continue" label={t('signup.continue')} variant="primary" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(dob)} onPress={() => setStep('photo')} />
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
  body: { fontFamily: FontFamily.sans, fontSize: FontSize.base, lineHeight: 24 },
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  skip: { alignSelf: 'center', paddingVertical: Spacing[2] },
  skipText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
})
