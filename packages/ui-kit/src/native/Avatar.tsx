import { View, Text, Image, StyleSheet } from 'react-native'
import { User } from 'lucide-react-native'
import { FontFamily } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

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
  const rtl = useRtl()
  const dim = { width: size, height: size, borderRadius: size / 2 }
  const inner = photoUri ? (
    <Image testID={testID ?? 'avatar-image'} source={{ uri: photoUri }} accessibilityRole="image" accessibilityLabel={name} style={dim} />
  ) : (
    <View testID={testID} accessibilityLabel={name} style={[styles.fallback, dim, { backgroundColor: colors.primary500 }]}>
      {initials(name) ? (
        <Text style={[styles.initials, { color: colors.white, fontSize: size * 0.38 }, rtl && styles.arabic]}>{initials(name)}</Text>
      ) : (
        <User size={size * 0.5} color={colors.white} />
      )}
    </View>
  )
  // Brand ring: a real 2px transparent gap (the padding shows the surface behind) then a
  // 1px primary stroke @50%. Mirrors the web Avatar `ring`; `+ '80'` ≈ 50% alpha (6-digit hex).
  return (
    <View
      style={{
        padding: RING_GAP,
        borderWidth: RING_WIDTH,
        borderColor: colors.primary500 + '80',
        borderRadius: size / 2 + RING_GAP + RING_WIDTH,
        backgroundColor: 'transparent',
        alignSelf: 'flex-start',
      }}
    >
      {inner}
    </View>
  )
}

const RING_GAP = 2
const RING_WIDTH = 1

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FontFamily.headingBold },
  arabic: { fontFamily: FontFamily.arabic },
})
