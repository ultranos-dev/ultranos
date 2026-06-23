import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SearchX } from 'lucide-react-native'
import type { DrugSearchResult, BrandSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { Chip, EmptyState } from '@ultranos/ui-kit/native'
import { Spacing } from '@ultranos/ui-kit/tokens.native'
import { DrugCard } from '@/components/DrugCard'
import { BrandResultCard } from '@/components/BrandResultCard'

type Filter = 'all' | 'gen' | 'brand'

interface Props {
  query: string
  results: DrugSearchResult[]
  brands: BrandSearchResult[]
  loading: boolean
  lang: Lang
  onSelectGeneric: (atcCode: string) => void
  onSelectBrand: (id: string) => void
}

/**
 * Unified search results with All / Generics / Brands filter chips (Option A).
 * The chips narrow the already-fetched results — they are not a search mode.
 * Generics render as DrugCard, brands as BrandResultCard; the brand→generic
 * link stays visible on every brand row.
 */
export function SearchResults({ query, results, brands, loading, lang, onSelectGeneric, onSelectBrand }: Props) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)
  const [filter, setFilter] = useState<Filter>('all')

  const showGenerics = filter !== 'brand'
  const showBrands = filter !== 'gen'
  const genericList = showGenerics ? (results ?? []) : []
  const brandList = showBrands ? (brands ?? []) : []
  const isEmpty = !loading && genericList.length === 0 && brandList.length === 0

  const chips: { key: Filter; label: string; testID: string }[] = [
    { key: 'all', label: t('search.filterAll'), testID: 'search-filter-all' },
    { key: 'gen', label: t('search.filterGenerics'), testID: 'search-filter-gen' },
    { key: 'brand', label: t('search.filterBrands'), testID: 'search-filter-brand' },
  ]

  return (
    <View style={styles.container}>
      <View style={[styles.chips, isRtl && styles.chipsRtl]}>
        {chips.map((c) => (
          <Chip key={c.key} testID={c.testID} label={c.label} selected={filter === c.key} onPress={() => setFilter(c.key)} />
        ))}
      </View>

      {isEmpty ? (
        <EmptyState icon={SearchX} title={t('search.noResultsTitle')} description={t('search.noResultsDescription')} />
      ) : (
        <View style={styles.list}>
          {genericList.map((g) => (
            <DrugCard key={`g-${g.atcCode}`} result={g} lang={lang} query={query} showKind onPress={() => onSelectGeneric(g.atcCode)} />
          ))}
          {brandList.map((b) => (
            <BrandResultCard key={`b-${b.id}`} result={b} lang={lang} onPress={() => onSelectBrand(b.id)} />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: Spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[1] },
  chipsRtl: { flexDirection: 'row-reverse' },
  list: { gap: Spacing[2] },
})
