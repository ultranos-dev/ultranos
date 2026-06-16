import { View, Text, Image, StyleSheet } from 'react-native'
import { User } from 'lucide-react-native'
import { FontFamily } from '../tokens.native'
import { useThemeColors } from './theme'

interface AvatarProps {
  name?: string
  photoUri?: string
  size?: number
  testID?: string
}

function initials(name?: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  if (!first) return ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
}

export function Avatar({ name, photoUri, size = 46, testID }: AvatarProps) {
  const colors = useThemeColors()
  const dim = { width: size, height: size, borderRadius: size / 2 }
  if (photoUri) {
    return <Image testID={testID ?? 'avatar-image'} source={{ uri: photoUri }} accessibilityRole="image" accessibilityLabel={name} style={dim} />
  }
  const text = initials(name)
  return (
    <View testID={testID} accessibilityLabel={name} style={[styles.fallback, dim, { backgroundColor: colors.primary500 }]}>
      {text ? (
        <Text style={[styles.initials, { color: colors.white, fontSize: size * 0.38 }]}>{text}</Text>
      ) : (
        <User size={size * 0.5} color={colors.white} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FontFamily.headingBold },
})
