import { useState, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Search, SearchX } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleList } from '@ultranos/ui-kit/native'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const addRecent = useRecentSearchStore((s) => s.add)
  const [query, setQuery] = useState(params.q ?? '')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        try { setResults(await searchDrugs(getDatabase(), q, lang, 50)) } catch { setResults([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  useEffect(() => {
    if (params.q && params.q.trim()) void handleSearch(params.q)
    // run once on mount with the seeded query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { if (query.trim()) await handleSearch(query) } finally { setRefreshing(false) }
  }, [query, handleSearch])

  const openDrug = (atcCode: string) => {
    if (query.trim()) void addRecent(query)
    router.push(`/drug/${atcCode}`)
  }

  const empty = loading ? (
    <View>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} testID={`skeleton-${i}`} />)}</View>
  ) : query.trim().length > 0 ? (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <SearchX size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.noResultsTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.noResultsDescription')}</Text>
    </View>
  ) : (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <Search size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.emptyTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.emptyDescription')}</Text>
    </View>
  )

  return (
    <CollapsibleList<DrugSearchResult>
      title={t('tabs.search')}
      subHeader={<View><SearchBar value={query} onSearch={handleSearch} /><SyncStatusBanner /><NetStatusBanner /></View>}
      data={results}
      keyExtractor={(item, index) => `${item.atcCode}-${index}`}
      renderItem={({ item }) => <DrugCard result={item} lang={lang} onPress={() => openDrug(item.atcCode)} />}
      ListEmptyComponent={empty}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', padding: Spacing[8], gap: Spacing[3], borderRadius: 12, margin: Spacing[4] },
  emptyTitle: { fontSize: FontSize.md, fontFamily: FontFamily.sansSemibold, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, textAlign: 'center' },
})
