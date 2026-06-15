import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { Heart } from 'lucide-react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { FontFamily, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
  index?: number
}

export function DrugCard({ result, lang, onPress, index }: Props) {
  const enterDelay = Math.min((index ?? 0) * 50, 500)
  const colors = useThemeColors()
  const bookmarked = useBookmarkStore((s) => s.isBookmarked(result.atcCode))
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
          Shadow.sm,
        ]}
        onPress={onPress}
        testID={`drug-card-${result.atcCode}`}
      >
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: colors.primary500 }]} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text
              testID="drug-primary-name"
              style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}
              numberOfLines={1}
            >
              {primaryName}
            </Text>
            <Heart
              size={18}
              color={bookmarked ? colors.danger : colors.textMuted}
              fill={bookmarked ? colors.danger : 'none'}
            />
          </View>
          {secondaryName && (
            <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
              {secondaryName}
            </Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.classBadge, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={[styles.classBadgeText, { color: colors.textSecondary }]}>
                {result.therapeuticClass}
              </Text>
            </View>
            <Text style={[styles.atcCode, { color: colors.textMuted }]}>{result.atcCode}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    padding: Spacing[3],
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryName: {
    fontSize: 16,
    fontFamily: FontFamily.sansSemibold,
    flex: 1,
    marginEnd: Spacing[2],
  },
  secondaryName: {
    fontSize: 13,
    fontFamily: FontFamily.sans,
    marginTop: 2,
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  classBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  classBadgeText: {
    fontSize: 12,
    fontFamily: FontFamily.sans,
  },
  atcCode: {
    fontSize: 12,
    fontFamily: FontFamily.sans,
  },
})
