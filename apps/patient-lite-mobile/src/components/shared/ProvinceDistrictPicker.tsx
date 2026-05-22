/**
 * ProvinceDistrictPicker — Cascading province/district dropdown for React Native.
 * Uses AFGHAN_PROVINCES and getDistrictsByProvince from shared-types.
 */
import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  AFGHAN_PROVINCES,
  getDistrictsByProvince,
  type AfghanProvince,
} from '@ultranos/shared-types'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

interface ProvinceDistrictPickerProps {
  province: AfghanProvince | ''
  district: string
  onProvinceChange: (province: AfghanProvince | '') => void
  onDistrictChange: (district: string) => void
  villageValue?: string
  onVillageChange?: (village: string) => void
  required?: boolean
}

type PickerTarget = 'province' | 'district' | null

export function ProvinceDistrictPicker({
  province,
  district,
  onProvinceChange,
  onDistrictChange,
  villageValue,
  onVillageChange,
  required,
}: ProvinceDistrictPickerProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null)
  const [filterText, setFilterText] = useState('')

  const districts = useMemo(() => {
    if (!province) return []
    return getDistrictsByProvince(province)
  }, [province])

  const filteredProvinces = useMemo(() => {
    if (!filterText) return [...AFGHAN_PROVINCES]
    const q = filterText.toLowerCase()
    return AFGHAN_PROVINCES.filter(p => p.toLowerCase().includes(q))
  }, [filterText])

  const filteredDistricts = useMemo(() => {
    if (!filterText) return districts
    const q = filterText.toLowerCase()
    return districts.filter(d =>
      d.name.toLowerCase().includes(q) || d.nameLocal.includes(filterText)
    )
  }, [filterText, districts])

  const handleSelectProvince = useCallback((p: AfghanProvince) => {
    onProvinceChange(p)
    onDistrictChange('')
    setPickerTarget(null)
    setFilterText('')
  }, [onProvinceChange, onDistrictChange])

  const handleSelectDistrict = useCallback((d: string) => {
    onDistrictChange(d)
    setPickerTarget(null)
    setFilterText('')
  }, [onDistrictChange])

  return (
    <View>
      {/* Province selector */}
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {t('registration.province')}{required && ' *'}
      </Text>
      <Pressable
        style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
        onPress={() => { setPickerTarget('province'); setFilterText('') }}
        accessibilityRole="button"
        accessibilityLabel={t('registration.province')}
      >
        <Text style={[styles.pickerButtonText, { color: province ? colors.textPrimary : colors.textMuted }]}>
          {province || t('registration.selectProvince')}
        </Text>
      </Pressable>

      {/* District selector */}
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {t('registration.district')}{required && ' *'}
      </Text>
      <Pressable
        style={[
          styles.pickerButton,
          { borderColor: colors.border, backgroundColor: province ? colors.surfaceElevated : colors.surface },
          !province && styles.disabled,
        ]}
        onPress={() => { if (province) { setPickerTarget('district'); setFilterText('') } }}
        disabled={!province}
        accessibilityRole="button"
        accessibilityLabel={t('registration.district')}
      >
        <Text style={[styles.pickerButtonText, { color: district ? colors.textPrimary : colors.textMuted }]}>
          {district || t('registration.selectDistrict')}
        </Text>
      </Pressable>

      {/* Village (optional) */}
      {onVillageChange && (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            {t('registration.village')}
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}
            value={villageValue}
            onChangeText={onVillageChange}
            placeholder={t('registration.village')}
            placeholderTextColor={colors.textMuted}
            maxLength={200}
          />
        </>
      )}

      {/* Picker modal */}
      <Modal visible={pickerTarget !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {pickerTarget === 'province' ? t('registration.province') : t('registration.district')}
              </Text>
              <Pressable onPress={() => { setPickerTarget(null); setFilterText('') }}>
                <Text style={[styles.modalClose, { color: colors.primary[500] }]}>
                  {t('common.close')}
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}
              value={filterText}
              onChangeText={setFilterText}
              placeholder={t('registration.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <FlatList
              data={
                pickerTarget === 'province'
                  ? filteredProvinces.map(p => ({ key: p, label: p }))
                  : filteredDistricts.map(d => ({ key: d.name, label: `${d.name} — ${d.nameLocal}` }))
              }
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.listItem, { borderColor: colors.border }]}
                  onPress={() => {
                    if (pickerTarget === 'province') handleSelectProvince(item.key as AfghanProvince)
                    else handleSelectDistrict(item.key)
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.listItemText, { color: colors.textPrimary }]}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
              style={styles.list}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
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
  pickerButton: {
    borderRadius: consumerBorderRadius.button,
    paddingHorizontal: consumerSpacing.md,
    paddingVertical: consumerSpacing.md,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  pickerButtonText: {
    fontSize: consumerTypography.bodySize,
  },
  disabled: { opacity: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingTop: consumerSpacing.lg,
    paddingBottom: consumerSpacing.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: consumerSpacing.md,
  },
  modalTitle: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  modalClose: {
    fontSize: consumerTypography.bodySize,
  },
  list: { marginTop: consumerSpacing.sm },
  listItem: {
    paddingVertical: consumerSpacing.md,
    paddingHorizontal: consumerSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listItemText: {
    fontSize: consumerTypography.bodySize,
  },
})
