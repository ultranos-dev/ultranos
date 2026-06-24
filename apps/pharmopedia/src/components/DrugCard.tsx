import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { Heart, Pill } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { getDatabase } from '@/db/migrations'
import { hapticSelection } from '@/lib/haptics'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { Card, useReducedMotion } from '@ultranos/ui-kit/native'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
  /** Active search query — the brand(s) it matches are promoted and highlighted. */
  query?: string
  /** Compact variant (Home): the Generic kind label sits inline before the name instead of on its own row. */
  compact?: boolean
}

/** Max brand chips shown before collapsing the rest into a "+N" chip. */
const MAX_BRAND_CHIPS = 3

export function DrugCard({ result, lang, onPress, query, compact }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const bookmarked = useBookmarkStore((s) => s.isBookmarked(result.atcCode))
  const toggleBookmark = useBookmarkStore((s) => s.toggle)
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)
  const reduced = useReducedMotion()

  // Brand chips: promote the brand(s) matching the active query to the front and
  // flag them, so a user who searched a brand sees which one matched the generic.
  const q = query?.trim().toLowerCase() ?? ''
  const isBrandMatch = (b: string) => q.length > 0 && b.toLowerCase().includes(q)
  const orderedBrands = [
    ...result.brandNames.filter(isBrandMatch),
    ...result.brandNames.filter((b) => !isBrandMatch(b)),
  ]
  const visibleBrands = orderedBrands.slice(0, MAX_BRAND_CHIPS)
  const brandOverflow = orderedBrands.length - visibleBrands.length

  const scale = useSharedValue(1)
  const iconAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  async function handleToggleBookmark() {
    const willBookmark = !bookmarked
    void hapticSelection()
    // Subtle pop when saving — confirms the action landed. Skip on removal and
    // when reduce-motion is on.
    if (willBookmark && !reduced) {
      scale.value = withSpring(1.25, { damping: 8 }, () => {
        scale.value = withSpring(1)
      })
    }
    await toggleBookmark(getDatabase(), {
      atcCode: result.atcCode,
      innName: result.innName,
      therapeuticClass: result.therapeuticClass,
    })
  }

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${result.innName}, ${result.therapeuticClass}`}
      testID={`drug-card-${result.atcCode}`}
    >
      <Card square>
        <View style={[styles.body, { backgroundColor: colors.surface }]}>
          {!compact ? (
            <View testID="kind-generic" style={[styles.kindRow, isRtl && styles.kindRowRtl]}>
              <Pill size={12} color={colors.info} />
              <Text style={[styles.kind, { color: colors.info }]}>{t('search.kindGeneric')}</Text>
            </View>
          ) : null}
          <View style={[styles.topRow, compact && isRtl && styles.topRowRtl]}>
            <Text
              testID="drug-primary-name"
              style={[
                styles.primaryName,
                { color: colors.textPrimary },
                // Arabic face only when the name is actually the local (RTL) name;
                // an English INN fallback stays Latin, right-aligned in RTL.
                useLocal ? styles.rtlText : isRtl && styles.fallbackName,
                // Compact: size to content so the kind label sits right after the
                // name; full: grow to fill so the bookmark stays at the edge.
                compact ? styles.nameShrink : styles.nameGrow,
              ]}
              numberOfLines={1}
            >
              {primaryName}
            </Text>
            {compact ? (
              <View testID="kind-generic" style={[styles.kindRow, isRtl && styles.kindRowRtl]}>
                <Pill size={12} color={colors.info} />
                <Text style={[styles.kind, { color: colors.info }]}>{t('search.kindGeneric')}</Text>
              </View>
            ) : null}
            {compact ? <View style={styles.flexSpacer} /> : null}
            <Pressable
              testID="bookmark-toggle"
              onPress={() => void handleToggleBookmark()}
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? t('drug.removeBookmark') : t('drug.addBookmark')}
              accessibilityState={{ selected: bookmarked }}
              hitSlop={10}
              style={styles.bookmarkBtn}
            >
              <Animated.View style={iconAnimatedStyle}>
                <Heart
                  size={18}
                  color={bookmarked ? colors.primary500 : colors.textMuted}
                  fill={bookmarked ? colors.primary500 : 'none'}
                />
              </Animated.View>
            </Pressable>
          </View>
          {secondaryName && (
            <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
              {secondaryName}
            </Text>
          )}
          {result.brandNames.length > 0 && (
            <View
              testID="drug-brand-chips"
              style={[styles.brandChips, isRtl && styles.brandChipsRtl]}
            >
              {visibleBrands.map((brand) => {
                const matched = isBrandMatch(brand)
                return (
                  <Text
                    key={brand}
                    testID={matched ? 'drug-brand-chip-matched' : 'drug-brand-chip'}
                    numberOfLines={1}
                    style={[
                      styles.chip,
                      matched
                        ? { backgroundColor: colors.primary500, borderColor: colors.primary500, color: colors.white }
                        : { backgroundColor: colors.primary50, borderColor: colors.primary100, color: colors.primary700 },
                    ]}
                  >
                    {brand}
                  </Text>
                )
              })}
              {brandOverflow > 0 && (
                <Text
                  testID="drug-brand-chip-more"
                  style={[styles.chip, { backgroundColor: colors.primary50, borderColor: colors.primary100, color: colors.primary700 }]}
                >
                  {`+${brandOverflow}`}
                </Text>
              )}
            </View>
          )}
          <Text
            testID="drug-meta"
            style={[styles.meta, { color: colors.textMuted, writingDirection: 'ltr', textAlign: isRtl ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {result.atcCode} · {result.therapeuticClass}
            {result.doseForms.length > 0 ? ` · ${result.doseForms.join(', ')}` : ''}
          </Text>
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  topRowRtl: { flexDirection: 'row-reverse' },
  primaryName: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansSemibold,
  },
  nameGrow: { flex: 1 },
  nameShrink: { flexShrink: 1 },
  flexSpacer: { flex: 1 },
  bookmarkBtn: {
    padding: 2,
  },
  secondaryName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right', writingDirection: 'rtl' },
  fallbackName: { textAlign: 'right', writingDirection: 'ltr' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindRowRtl: { flexDirection: 'row-reverse' },
  kind: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold, letterSpacing: 0.5, textTransform: 'uppercase' },
  brandChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1],
    marginTop: Spacing[1],
  },
  brandChipsRtl: { flexDirection: 'row-reverse' },
  chip: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansSemibold,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    marginTop: 1,
  },
})
