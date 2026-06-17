import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useLangStore, type Lang } from '@/store/lang-store'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticSelection } from '@/lib/haptics'

const CHIPS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'prs', label: 'دری' },
  { value: 'ps', label: 'پښتو' },
  { value: 'ar', label: 'عربي' },
]

export function LanguageChips() {
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {CHIPS.map((chip) => {
        const active = lang === chip.value
        return (
          <Pressable
            key={chip.value}
            testID={`lang-chip-${chip.value}`}
            accessibilityRole="radio"
            accessibilityLabel={chip.label}
            accessibilityState={{ selected: lang === chip.value }}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary500 : colors.surfaceSubtle,
                borderColor: active ? colors.primary500 : colors.border,
              },
            ]}
            onPress={() => {
              void hapticSelection()
              void setLang(chip.value)
            }}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? '#ffffff' : colors.textSecondary },
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
  },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansMedium,
  },
})
