import { useState, useCallback } from 'react'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export function useDrugSearch(): {
  query: string
  results: DrugSearchResult[]
  loading: boolean
  search: (q: string) => Promise<void>
} {
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        try { setResults(await searchDrugs(getDatabase(), q, lang, 50)) } catch { setResults([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
      } else {
        setResults([])
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  return { query, results, loading, search }
}
