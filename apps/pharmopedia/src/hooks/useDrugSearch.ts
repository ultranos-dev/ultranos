import { useState, useCallback } from 'react'
import { searchDrugs } from '@/db/fts'
import { searchBrandsLocal } from '@/db/brands'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import type { DrugSearchResult, BrandSearchResult } from '@ultranos/shared-types'

export function useDrugSearch(): {
  query: string
  results: DrugSearchResult[]
  brands: BrandSearchResult[]
  loading: boolean
  search: (q: string) => Promise<void>
} {
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [brands, setBrands] = useState<BrandSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); setBrands([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        const db = getDatabase()
        try { setResults(await searchDrugs(db, q, lang, 50)) } catch { setResults([]) }
        // Brand hits come from the local brand cache (no online fallback yet).
        try { setBrands(await searchBrandsLocal(db, q, 50)) } catch { setBrands([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
        setBrands([])
      } else {
        setResults([]); setBrands([])
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  return { query, results, brands, loading, search }
}
