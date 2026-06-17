import { Pressable, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  testID?: string
}

export function Chip({ label, selected = false, onPress, testID }: ChipProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary500 : colors.surface, borderColor: selected ? colors.primary500 : colors.border },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.white : colors.textSecondary }, selected && styles.selected, rtl && styles.arabic]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  label: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  selected: { fontFamily: FontFamily.sansSemibold },
  arabic: { fontFamily: FontFamily.arabic },
})
