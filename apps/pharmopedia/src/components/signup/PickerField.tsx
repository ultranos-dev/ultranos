import { useState } from 'react'
import { View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet } from 'react-native'
import { ChevronDown, X } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

interface Props {
  label: string
  placeholder: string
  value: string
  options: string[]
  onSelect: (value: string) => void
  disabled?: boolean
  testID?: string
}

export function PickerField({ label, placeholder, value, options, onSelect, disabled, testID }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Pressable
        testID={testID ? `${testID}-trigger` : undefined}
        onPress={() => { if (!disabled) setOpen(true) }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.trigger, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }, disabled && styles.disabled]}
      >
        <Text testID={testID ? `${testID}-value` : undefined} style={[styles.value, { color: value ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{label}</Text>
            <Pressable testID={testID ? `${testID}-close` : undefined} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            style={[styles.search, { backgroundColor: colors.surfaceSubtle, color: colors.textPrimary }]}
            placeholder={t('signup.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item); setOpen(false); setQuery('') }}
                accessibilityRole="button"
                style={[styles.option, { borderBottomColor: colors.borderSubtle ?? colors.border }]}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], minHeight: 48 },
  disabled: { opacity: 0.5 },
  value: { flex: 1, fontFamily: FontFamily.sans, fontSize: FontSize.base },
  sheet: { flex: 1, marginTop: Spacing[16], borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing[4], gap: Spacing[3] },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: FontFamily.headingBold, fontSize: FontSize.lg },
  search: { borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3], fontFamily: FontFamily.sans, fontSize: FontSize.base },
  option: { paddingVertical: Spacing[3], borderBottomWidth: StyleSheet.hairlineWidth },
  optionText: { fontFamily: FontFamily.sans, fontSize: FontSize.base },
})
