import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Pill } from 'lucide-react-native'
import { Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugImage } from '@ultranos/shared-types'

export function DrugThumbnail({ images, name, size = 44 }: { images?: DrugImage[]; name: string; size?: number }) {
  const colors = useThemeColors()
  const url = images?.find((i) => i.isPrimary)?.url ?? images?.[0]?.url
  const dim = { width: size, height: size, borderRadius: Radius.md }

  if (url) {
    return (
      <Image
        testID="drug-thumb-image"
        source={url}
        style={[dim, { backgroundColor: colors.surfaceSubtle }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name}
      />
    )
  }
  return (
    <View testID="drug-thumb-fallback" style={[styles.fallback, dim, { backgroundColor: colors.surfaceSubtle }]}>
      <Pill size={size * 0.5} color={colors.primary500} />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
})
