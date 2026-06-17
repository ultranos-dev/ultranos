import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { enrichDrugApi, type EnrichFields } from '@/api/drug-catalog'
import { upsertDrugBatch } from '@/db/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

export function EnrichTab({ atcCode }: { atcCode: string }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { token, user } = useAuthStore()
  const role = user?.role ?? ''
  const isClinical = CLINICAL_ROLES.has(role) || PHARMACIST_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)

  const [localNameEn, setLocalNameEn] = useState('')
  const [localNamePrs, setLocalNamePrs] = useState('')
  const [dispensingNotes, setDispensingNotes] = useState('')
  const [formularyStatus, setFormularyStatus] = useState<FormularyStatus | ''>('')
  const [unitCost, setUnitCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isClinical) {
    return (
      <View style={styles.restricted}>
        <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>{t('enrich.restricted')}</Text>
      </View>
    )
  }

  async function handleSubmit() {
    if (!token) return
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const fields: EnrichFields = {}
      const localNames: Record<string, string> = {}
      if (localNameEn) localNames.en = localNameEn
      if (localNamePrs) localNames.prs = localNamePrs
      if (Object.keys(localNames).length > 0) fields.localNames = localNames
      if (isPharmacist) {
        if (dispensingNotes) fields.dispensingNotes = dispensingNotes
        if (formularyStatus) fields.formularyStatus = formularyStatus as FormularyStatus
        if (unitCost) fields.unitCost = parseFloat(unitCost)
      }
      const updated = await enrichDrugApi(atcCode, fields, token)
      await upsertDrugBatch(getDatabase(), [updated])
      setSuccess(true)
      void hapticNotification(NotificationFeedbackType.Success)
    } catch {
      setError(t('enrich.saveError'))
      void hapticNotification(NotificationFeedbackType.Error)
    }
    setLoading(false)
  }

  const formularyOptions: { value: FormularyStatus; labelKey: string }[] = [
    { value: 'on_formulary', labelKey: 'enrich.onFormulary' },
    { value: 'off_formulary', labelKey: 'enrich.offFormulary' },
    { value: 'restricted', labelKey: 'enrich.restrictedStatus' },
  ]

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('enrich.localNames')}</Text>
      <TextInput testID="local-name-en" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} placeholder={t('enrich.englishName')} placeholderTextColor={colors.textMuted} value={localNameEn} onChangeText={setLocalNameEn} accessibilityLabel={t('enrich.englishName')} />
      <TextInput testID="local-name-prs" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} placeholder={t('enrich.dariName')} placeholderTextColor={colors.textMuted} value={localNamePrs} onChangeText={setLocalNamePrs} accessibilityLabel={t('enrich.dariName')} />

      {isPharmacist && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: Spacing[4], color: colors.textSecondary }]}>{t('enrich.pharmacistFields')}</Text>
          <TextInput testID="dispensing-notes" style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.textPrimary }]} placeholder={t('enrich.dispensingNotes')} placeholderTextColor={colors.textMuted} value={dispensingNotes} onChangeText={setDispensingNotes} multiline maxLength={500} accessibilityLabel={t('enrich.dispensingNotes')} />

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('enrich.formularyStatus')}</Text>
          <View style={styles.formularyRow} accessibilityRole="radiogroup">
            {formularyOptions.map(({ value, labelKey }) => (
              <Pressable
                key={value}
                testID={`formulary-${value}`}
                style={[styles.formularyBtn, { borderColor: colors.border }, formularyStatus === value && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
                onPress={() => setFormularyStatus(value)}
                accessibilityRole="radio"
                accessibilityLabel={t(labelKey)}
                accessibilityState={{ selected: formularyStatus === value }}
              >
                <Text style={[styles.formularyText, { color: colors.textSecondary }, formularyStatus === value && { color: colors.white }]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput testID="unit-cost" style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} placeholder={t('enrich.unitCost')} placeholderTextColor={colors.textMuted} value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" accessibilityLabel={t('enrich.unitCost')} />
        </>
      )}

      {error && <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">{error}</Text>}
      {success && <Text style={[styles.successText, { color: colors.successDark }]}>{t('enrich.saveSuccess')}</Text>}

      <Pressable testID="enrich-submit" style={[styles.button, { backgroundColor: colors.primary500 }]} onPress={handleSubmit} disabled={loading} accessibilityRole="button" accessibilityLabel={t('enrich.save')} accessibilityState={{ disabled: loading, busy: loading }}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.buttonText, { color: colors.white }]}>{t('enrich.save')}</Text>}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  restricted: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[6] },
  restrictedText: { textAlign: 'center', fontFamily: FontFamily.sans },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, marginBottom: Spacing[1] },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[3],
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    marginBottom: Spacing[3],
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  formularyRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3], flexWrap: 'wrap' },
  formularyBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  formularyText: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  error: { marginBottom: Spacing[2], fontFamily: FontFamily.sans },
  successText: { marginBottom: Spacing[2], fontFamily: FontFamily.sans },
  button: {
    borderRadius: Radius.md,
    padding: Spacing[3],
    alignItems: 'center',
  },
  buttonText: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
})
