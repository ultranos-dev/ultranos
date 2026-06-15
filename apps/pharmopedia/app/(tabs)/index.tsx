import { useState, useCallback } from 'react'
import { View, FlatList, Text, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Search, SearchX } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SkeletonCard } from '@/components/SkeletonCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }

    setLoading(true)
    try {
      if (lastVersion > 0) {
        try {
          const db = getDatabase()
          const rows = await searchDrugs(db, q, lang, 50)
          setResults(rows)
        } catch {
          setResults([])
        }
      } else if (token) {
        try {
          const rows = await searchDrugsApi(q, lang, 20, token)
          setResults(rows)
        } catch {
          setResults([])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [lastVersion, lang, token])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (query.trim()) await handleSearch(query)
    } finally {
      setRefreshing(false)
    }
  }, [query, handleSearch])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
      <SearchBar value={query} onSearch={handleSearch} />
      <SyncStatusBanner />
      <NetStatusBanner />
      {loading && results.length === 0 && (
        <View>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} testID={`skeleton-${i}`} />
          ))}
        </View>
      )}
      {!loading && results.length === 0 && !query.trim() && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <Search size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.emptyTitle')}</Text>
          <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('search.emptyDescription')}</Text>
        </View>
      )}
      {!loading && results.length === 0 && query.trim().length > 0 && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <SearchX size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.noResultsTitle')}</Text>
          <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('search.noResultsDescription')}</Text>
        </View>
      )}
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.atcCode}-${index}`}
          renderItem={({ item }) => (
            <DrugCard
              result={item}
              lang={lang}
              onPress={() => router.push(`/drug/${item.atcCode}`)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary500} />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
