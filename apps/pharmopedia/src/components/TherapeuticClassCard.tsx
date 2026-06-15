import { Pressable, Text, StyleSheet } from 'react-native'

interface Props {
  name: string
  count: number
  onPress: () => void
}

export function TherapeuticClassCard({ name, count, onPress }: Props) {
  return (
    <Pressable
      testID={`class-card-${name}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      <Text style={styles.count}>{count}</Text>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cardPressed: { backgroundColor: '#f9fafb' },
  name: { fontSize: 15, fontWeight: '500', color: '#111827', flex: 1, marginEnd: 12 },
  count: { fontSize: 13, color: '#6b7280', minWidth: 24, textAlign: 'right' },
})
