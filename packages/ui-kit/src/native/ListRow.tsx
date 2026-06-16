import { type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface ListRowProps {
  icon?: LucideIcon
  label: string
  value?: string
  trailing?: ReactNode
  onPress?: () => void
  destructive?: boolean
  accessibilityHint?: string
  testID?: string
}

export function ListRow({
  icon: Icon,
  label,
  value,
  trailing,
  onPress,
  destructive,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const labelColor = destructive ? colors.danger : colors.textPrimary
  const content = (
    <View style={[styles.row, rtl && styles.rowRtl]}>
      {Icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.primary50 }]}>
          <Icon size={18} color={colors.primary600} />
        </View>
      ) : null}
      <Text
        style={[styles.label, { color: labelColor, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? <Text style={[styles.value, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]} numberOfLines={1}>{value}</Text> : null}
      {trailing ?? (onPress ? <ChevronRight size={18} color={colors.textMuted} style={rtl ? styles.chevRtl : undefined} /> : null)}
    </View>
  )
  if (!onPress) return <View testID={testID}>{content}</View>
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfaceSubtle }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], minHeight: 48, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  rowRtl: { flexDirection: 'row-reverse' },
  iconWrap: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontFamily: FontFamily.sansMedium, fontSize: FontSize.base },
  value: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
  chevRtl: { transform: [{ scaleX: -1 }] },
})
