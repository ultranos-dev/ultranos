import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus } from 'lucide-react-native'
import { CollapsibleList, EmptyState } from '@ultranos/ui-kit/native'
import { DrugCard } from '@/components/DrugCard'
import { useLangStore } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SavedTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 300)
  }, [])

  const drugResults = useMemo<DrugSearchResult[]>(
    () => bookmarks.map((item) => ({
      atcCode: item.atcCode, innName: item.innName, brandNames: [], doseForms: [],
      therapeuticClass: item.therapeuticClass ?? '', localName: undefined,
    })),
    [bookmarks],
  )

  return (
    <CollapsibleList<DrugSearchResult>
      title={t('tabs.saved')}
      data={drugResults}
      keyExtractor={(item) => item.atcCode}
      renderItem={({ item }) => <DrugCard result={item} lang={lang} onPress={() => router.push(`/drug/${item.atcCode}`)} />}
      ListEmptyComponent={
        <EmptyState
          icon={BookmarkPlus}
          title={t('saved.emptyTitle')}
          description={t('saved.emptyDescription')}
          action={{ label: t('saved.browseCta'), onPress: () => router.push('/(tabs)/browse') }}
        />
      }
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  )
}
