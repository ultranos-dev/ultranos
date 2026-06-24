import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

type Variant = 'info' | 'warning' | 'error' | 'success'

interface BannerProps {
  variant: Variant
  text: string
  icon?: LucideIcon
  onPress?: () => void
  /** When provided, renders a trailing circular close button that calls this. */
  onDismiss?: () => void
  /** Accessibility label for the close button (required when onDismiss is set). */
  dismissLabel?: string
  testID?: string
}

const DEFAULT_ICON: Record<Variant, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle,
}

export function Banner({ variant, text, icon, onPress, onDismiss, dismissLabel, testID }: BannerProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
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
      <Text style={[styles.text, { color: palette.fg }, rtl && styles.arabic]}>{text}</Text>
      {onDismiss && (
        <Pressable
          testID={testID ? `${testID}-dismiss` : undefined}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={styles.dismiss}
        >
          <XCircle size={18} color={palette.fg} />
        </Pressable>
      )}
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
  dismiss: { marginInlineStart: Spacing[1] },
  arabic: { fontFamily: FontFamily.arabic },
})
