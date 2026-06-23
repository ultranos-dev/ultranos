import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus } from 'lucide-react-native'
import { CollapsibleList, EmptyState } from '@ultranos/ui-kit/native'
import { DrugCard } from '@/components/DrugCard'
import { BrandResultCard } from '@/components/BrandResultCard'
import { useLangStore } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import type { DrugSearchResult, BrandSearchResult } from '@ultranos/shared-types'

type SavedItem =
  | { kind: 'generic'; savedAt: string; generic: DrugSearchResult }
  | { kind: 'brand'; savedAt: string; brand: BrandSearchResult }

export default function SavedTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const brandBookmarks = useBookmarkStore((s) => s.brandBookmarks)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 300)
  }, [])

  // Generics and brands merged into one list, newest-saved first.
  const items = useMemo<SavedItem[]>(() => {
    const generics: SavedItem[] = bookmarks.map((b) => ({
      kind: 'generic', savedAt: b.savedAt,
      generic: { atcCode: b.atcCode, innName: b.innName, brandNames: [], doseForms: [], therapeuticClass: b.therapeuticClass ?? '', localName: undefined },
    }))
    const brands: SavedItem[] = brandBookmarks.map((b) => ({
      kind: 'brand', savedAt: b.savedAt,
      brand: { id: b.id, brandName: b.brandName, manufacturer: b.manufacturer ?? undefined, genericAtcCode: b.genericAtcCode, genericInnName: b.genericInnName ?? '', doseForm: b.doseForm ?? undefined, referencePrice: b.referencePrice ?? undefined, currency: b.currency ?? undefined },
    }))
    return [...generics, ...brands].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }, [bookmarks, brandBookmarks])

  return (
    <CollapsibleList<SavedItem>
      title={t('tabs.saved')}
      data={items}
      keyExtractor={(item) => (item.kind === 'brand' ? `b-${item.brand.id}` : `g-${item.generic.atcCode}`)}
      renderItem={({ item }) =>
        item.kind === 'brand' ? (
          <BrandResultCard result={item.brand} lang={lang} onPress={() => router.push({ pathname: '/brand/[id]', params: { id: item.brand.id } })} />
        ) : (
          <DrugCard result={item.generic} lang={lang} onPress={() => router.push(`/drug/${item.generic.atcCode}`)} />
        )
      }
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
