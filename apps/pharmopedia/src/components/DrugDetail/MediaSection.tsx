import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugImage } from '@ultranos/shared-types'

export function MediaSection({ images }: { images: DrugImage[] }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  if (!images || images.length === 0) return null

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {images.map((img, i) => (
          <View key={img.url ?? i} testID={`media-tile-${i}`} style={styles.tile}>
            <Image
              source={img.url}
              style={[styles.image, { backgroundColor: colors.surfaceSubtle }]}
              contentFit="cover"
              transition={150}
              accessibilityLabel={img.caption ?? img.brand ?? t('drug.photos.generic')}
            />
            <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
              {img.brand ?? t('drug.photos.generic')}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text testID="media-disclaimer" style={[styles.disclaimer, { color: colors.textMuted }]}>
        {t('drug.photos.disclaimer')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { gap: Spacing[3], paddingVertical: Spacing[1] },
  tile: { width: 120, gap: Spacing[1] },
  image: { width: 120, height: 120, borderRadius: Radius.md },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.sansSemibold },
  disclaimer: { marginTop: Spacing[2], fontSize: FontSize.xs, fontFamily: FontFamily.sans, fontStyle: 'italic' },
})
