import { Pressable, Text, ActivityIndicator, View, StyleSheet } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

type Variant = 'primary' | 'secondary' | 'destructive'

interface ButtonProps {
  label: string
  variant?: Variant
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  onPress: () => void
  testID?: string
}

export function Button({ label, variant = 'primary', icon: Icon, loading = false, disabled = false, onPress, testID }: ButtonProps) {
  const colors = useThemeColors()
  const bg = variant === 'primary' ? colors.primary500 : variant === 'destructive' ? colors.dangerLight : colors.surface
  const fg = variant === 'primary' ? colors.white : variant === 'destructive' ? colors.dangerDark : colors.primary500
  const border = variant === 'secondary' ? colors.primary500 : colors.transparent
  const isDisabled = disabled || loading
  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[styles.btn, { backgroundColor: bg, borderColor: border }, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator testID="button-spinner" color={fg} />
      ) : (
        <View style={styles.inner}>
          {Icon ? <Icon size={16} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  inner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  label: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
  disabled: { opacity: 0.6 },
})
