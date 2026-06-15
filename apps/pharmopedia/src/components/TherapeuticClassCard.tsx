import { Pressable, Text, StyleSheet } from 'react-native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  name: string
  count: number
  onPress: () => void
}

export function TherapeuticClassCard({ name, count, onPress }: Props) {
  const colors = useThemeColors()

  return (
    <Pressable
      testID={`class-card-${name}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle },
        pressed && { backgroundColor: colors.surfaceSubtle },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>{name}</Text>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{count}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  name: { fontSize: 15, fontWeight: '500', flex: 1, marginEnd: 12 },
  count: { fontSize: 13, minWidth: 24, textAlign: 'right' },
})
