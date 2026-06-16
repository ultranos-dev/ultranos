import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Info, AlertTriangle, CheckCircle } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

type Variant = 'info' | 'warning' | 'error' | 'success'

interface BannerProps {
  variant: Variant
  text: string
  icon?: LucideIcon
  onPress?: () => void
  testID?: string
}

const DEFAULT_ICON: Record<Variant, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle,
}

export function Banner({ variant, text, icon, onPress, testID }: BannerProps) {
  const colors = useThemeColors()
  const palette = {
    info: { bg: colors.infoLight, fg: colors.info },
    warning: { bg: colors.warningLight, fg: colors.warning },
    error: { bg: colors.dangerLight, fg: colors.danger },
    success: { bg: colors.successLight, fg: colors.success },
  }[variant]
  const Icon = icon ?? DEFAULT_ICON[variant]
  const role = variant === 'warning' || variant === 'error' ? 'alert' : undefined
  const inner = (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Icon size={16} color={palette.fg} />
      <Text style={[styles.text, { color: palette.fg }]}>{text}</Text>
    </View>
  )
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={text}>
        {inner}
      </Pressable>
    )
  }
  return (
    <View testID={testID} accessibilityRole={role} accessibilityLabel={role ? text : undefined}>
      {inner}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderRadius: Radius.lg, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3] },
  text: { flex: 1, fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
})
