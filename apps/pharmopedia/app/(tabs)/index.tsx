import { useState, useCallback } from 'react'
import { View, FlatList, Text, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }

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
  }, [lastVersion, lang, token])

  return (
    <SafeAreaView style={styles.container}>
      <SearchBar value={query} onSearch={handleSearch} />
      <SyncStatusBanner />
      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('search.empty')}</Text>
        </View>
      ) : (
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
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 15 },
})
