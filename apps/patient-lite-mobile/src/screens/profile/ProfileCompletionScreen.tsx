/**
 * ProfileCompletionScreen — Optional field collection for MPI enrichment.
 * Collects grandfather's name, province/district (origin address), and village.
 * Fields already filled are pre-populated from the patient record.
 */
import { useCallback, useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { ProvinceDistrictPicker } from '@/components/shared/ProvinceDistrictPicker'
import type { AfghanProvince } from '@ultranos/shared-types'

interface ProfileCompletionScreenProps {
  patient: {
    nameGrandfather?: string
    addressProvinceOrigin?: string
    addressDistrictOrigin?: string
    addressVillageOrigin?: string
  } | null
  onSave: (data: {
    nameGrandfather: string
    addressProvinceOrigin: string
    addressDistrictOrigin: string
    addressVillageOrigin: string
  }) => Promise<void>
  onSkip: () => void
}

export function ProfileCompletionScreen({
  patient,
  onSave,
  onSkip,
}: ProfileCompletionScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const [nameGrandfather, setNameGrandfather] = useState('')
  const [province, setProvince] = useState<AfghanProvince | ''>('')
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-populate from existing patient data
  useEffect(() => {
    if (patient) {
      setNameGrandfather(patient.nameGrandfather ?? '')
      setProvince((patient.addressProvinceOrigin ?? '') as AfghanProvince | '')
      setDistrict(patient.addressDistrictOrigin ?? '')
      setVillage(patient.addressVillageOrigin ?? '')
    }
  }, [patient])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        nameGrandfather: nameGrandfather.trim(),
        addressProvinceOrigin: province,
        addressDistrictOrigin: district,
        addressVillageOrigin: village.trim(),
      })
    } catch {
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }, [nameGrandfather, province, district, village, onSave, t])

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('registration.completeProfile')}
          </Text>
          <Pressable onPress={onSkip} accessibilityRole="button">
            <Text style={[styles.skipButton, { color: colors.primary[500] }]}>
              {t('common.skip')}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('registration.completeProfileSubtitle')}
        </Text>

        {/* Grandfather's name */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('registration.grandfatherName')}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}
          value={nameGrandfather}
          onChangeText={setNameGrandfather}
          placeholder={t('registration.grandfatherName')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          maxLength={200}
          accessibilityLabel={t('registration.grandfatherName')}
        />

        {/* Origin address */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('registration.originAddress')}
        </Text>
        <ProvinceDistrictPicker
          province={province}
          district={district}
          onProvinceChange={setProvince}
          onDistrictChange={setDistrict}
          villageValue={village}
          onVillageChange={setVillage}
        />

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary[500] },
            saving && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('common.save')}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              {t('common.save')}
            </Text>
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: consumerSpacing.sm,
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  skipButton: {
    fontSize: consumerTypography.bodySize,
  },
  subtitle: {
    fontSize: consumerTypography.bodySize,
    marginBottom: consumerSpacing.lg,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    marginTop: consumerSpacing.lg,
    marginBottom: consumerSpacing.xs,
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
