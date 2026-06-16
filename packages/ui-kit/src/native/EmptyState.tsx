import { View, Text, StyleSheet } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
  testID?: string
}

export function EmptyState({ icon: Icon, title, description, action, testID }: EmptyStateProps) {
  const colors = useThemeColors()
  return (
    <View testID={testID} style={styles.wrap}>
      <Icon size={44} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description ? <Text style={[styles.desc, { color: colors.textSecondary }]}>{description}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[8], gap: Spacing[3] },
  title: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.md, textAlign: 'center' },
  desc: { fontFamily: FontFamily.sans, fontSize: FontSize.sm, textAlign: 'center' },
  action: { marginTop: Spacing[2] },
})
