import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Tag, Heart } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { BrandSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { getDatabase } from '@/db/migrations'
import { hapticSelection } from '@/lib/haptics'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { Card } from '@ultranos/ui-kit/native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  result: BrandSearchResult
  lang: Lang
  onPress: () => void
}

/**
 * A brand search result — visually distinct from the generic DrugCard: brand
 * name + price lead, with the generic it resolves to and the manufacturer
 * beneath. Tapping opens the brand-detail view.
 */
export function BrandResultCard({ result, lang, onPress }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const isRtl = isRtlLang(lang)
  const align = { textAlign: isRtl ? ('right' as const) : ('left' as const) }
  const subtitle = [result.genericInnName, result.doseForm].filter(Boolean).join(' · ')
  const bookmarked = useBookmarkStore((s) => s.isBrandBookmarked(result.id))
  const toggleBrand = useBookmarkStore((s) => s.toggleBrand)

  async function handleToggleBookmark() {
    void hapticSelection()
    await toggleBrand(getDatabase(), {
      id: result.id, brandName: result.brandName, genericAtcCode: result.genericAtcCode,
      genericInnName: result.genericInnName, manufacturer: result.manufacturer,
      doseForm: result.doseForm, referencePrice: result.referencePrice, currency: result.currency,
    })
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${result.brandName}, ${result.genericInnName}`}
      testID={`brand-result-${result.id}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card square>
        <View style={[styles.body, { backgroundColor: colors.surface }]}>
          <View testID="kind-brand" style={[styles.kindRow, isRtl && styles.kindRowRtl]}>
            <Tag size={12} color={colors.primary600} />
            <Text style={[styles.kind, { color: colors.primary600 }]}>{t('search.kindBrand')}</Text>
          </View>
          <View style={[styles.topRow, isRtl && styles.rtlRow]}>
            <Text style={[styles.brandName, { color: colors.textPrimary }, align]} numberOfLines={1}>
              {result.brandName}
            </Text>
            {result.referencePrice != null && (
              <Text
                testID="brand-result-price"
                style={[styles.price, { backgroundColor: colors.primary50, color: colors.primary700 }]}
              >
                {`${result.referencePrice}${result.currency ? ` ${result.currency}` : ''}`}
              </Text>
            )}
            <Pressable
              testID="brand-bookmark-toggle"
              onPress={() => void handleToggleBookmark()}
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? t('drug.removeBookmark') : t('drug.addBookmark')}
              accessibilityState={{ selected: bookmarked }}
              hitSlop={10}
              style={styles.bookmarkBtn}
            >
              <Heart size={18} color={bookmarked ? colors.primary500 : colors.textMuted} fill={bookmarked ? colors.primary500 : 'none'} />
            </Pressable>
          </View>
          {subtitle ? (
            <Text style={[styles.generic, { color: colors.textSecondary }, align]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {result.manufacturer ? (
            <Text style={[styles.mfr, { color: colors.textMuted }, align]} numberOfLines={1}>
              {result.manufacturer}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: 2 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindRowRtl: { flexDirection: 'row-reverse' },
  kind: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold, letterSpacing: 0.5, textTransform: 'uppercase' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  rtlRow: { flexDirection: 'row-reverse' },
  brandName: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  price: {
    fontSize: FontSize.sm, fontFamily: FontFamily.sansBold,
    borderRadius: Radius.md, paddingHorizontal: Spacing[2], paddingVertical: 2, overflow: 'hidden',
  },
  generic: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  mfr: { fontSize: FontSize.xs, fontFamily: FontFamily.sans, marginTop: 1 },
  bookmarkBtn: { padding: 2 },
})
