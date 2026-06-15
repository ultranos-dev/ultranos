import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Heart } from 'lucide-react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
}

export function DrugCard({ result, lang, onPress }: Props) {
  const colors = useThemeColors()
  const bookmarked = useBookmarkStore((s) => s.isBookmarked(result.atcCode))
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderBottomColor: colors.borderSubtle },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${result.innName}, ${result.therapeuticClass}`}
      testID={`drug-card-${result.atcCode}`}
    >
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text
            testID="drug-primary-name"
            style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}
            numberOfLines={1}
          >
            {primaryName}
          </Text>
          {bookmarked && (
            <Heart size={14} color={colors.primary500} fill={colors.primary500} />
          )}
        </View>
        {secondaryName && (
          <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
            {secondaryName}
          </Text>
        )}
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {result.atcCode} · {result.therapeuticClass}
          {result.doseForms.length > 0 ? ` · ${result.doseForms.join(', ')}` : ''}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: {
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  primaryName: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansSemibold,
    flex: 1,
  },
  secondaryName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right' },
  meta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    marginTop: 1,
  },
})
