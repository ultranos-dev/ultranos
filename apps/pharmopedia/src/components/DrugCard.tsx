import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Heart } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { getDatabase } from '@/db/migrations'
import { hapticSelection } from '@/lib/haptics'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { Card } from '@ultranos/ui-kit/native'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
}

export function DrugCard({ result, lang, onPress }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const bookmarked = useBookmarkStore((s) => s.isBookmarked(result.atcCode))
  const toggleBookmark = useBookmarkStore((s) => s.toggle)
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  async function handleToggleBookmark() {
    void hapticSelection()
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
          <View style={styles.topRow}>
            <Text
              testID="drug-primary-name"
              style={[
                styles.primaryName,
                { color: colors.textPrimary },
                // Arabic face only when the name is actually the local (RTL) name;
                // an English INN fallback stays Latin, right-aligned in RTL.
                useLocal ? styles.rtlText : isRtl && styles.fallbackName,
              ]}
              numberOfLines={1}
            >
              {primaryName}
            </Text>
            <Pressable
              testID="bookmark-toggle"
              onPress={() => void handleToggleBookmark()}
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? t('drug.removeBookmark') : t('drug.addBookmark')}
              accessibilityState={{ selected: bookmarked }}
              hitSlop={10}
              style={styles.bookmarkBtn}
            >
              <Heart
                size={18}
                color={bookmarked ? colors.primary500 : colors.textMuted}
                fill={bookmarked ? colors.primary500 : 'none'}
              />
            </Pressable>
          </View>
          {secondaryName && (
            <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
              {secondaryName}
            </Text>
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
  primaryName: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansSemibold,
    flex: 1,
  },
  bookmarkBtn: {
    padding: 2,
  },
  secondaryName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right', writingDirection: 'rtl' },
  fallbackName: { textAlign: 'right', writingDirection: 'ltr' },
  meta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    marginTop: 1,
  },
})
