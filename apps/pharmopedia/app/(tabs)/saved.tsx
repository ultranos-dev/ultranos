import { useMemo, useState, useCallback } from 'react'
import { FlatList, StyleSheet, Text, View, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { DrugCard } from '@/components/DrugCard'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SavedTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const isRtl = isRtlLang(lang)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    // Bookmarks are already reactive via Zustand, so just a brief delay for pull feedback
    setTimeout(() => setRefreshing(false), 300)
  }, [])

  const drugResults = useMemo<DrugSearchResult[]>(
    () => bookmarks.map((item) => ({
      atcCode: item.atcCode,
      innName: item.innName,
      brandNames: [],
      doseForms: [],
      therapeuticClass: item.therapeuticClass ?? '',
      localName: undefined,
    })),
    [bookmarks],
  )

  if (bookmarks.length === 0) {
    return (
      <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
        <BookmarkPlus size={48} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('saved.emptyTitle')}</Text>
        <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('saved.emptyDescription')}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }, isRtl && styles.containerRtl]}>
      <NetStatusBanner />
      <FlatList
        data={drugResults}
        keyExtractor={(item) => item.atcCode}
        renderItem={({ item, index }) => (
          <DrugCard
            result={item}
            lang={lang}
            onPress={() => router.push(`/drug/${item.atcCode}`)}
            index={index}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary500} />
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerRtl: { writingDirection: 'rtl' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
