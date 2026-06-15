import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPatientsLocal, searchPatientsHub } from '@/lib/patient-search'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { LocalPatient } from '@/lib/db'

const DEBOUNCE_MS = 300

interface UsePatientSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: LocalPatient[]
  isSearching: boolean
  hasSearched: boolean
}

export function usePatientSearch(): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalPatient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Phase 1: Fast local search
      const localResults = await searchPatientsLocal(q)
      setResults(localResults)
      setHasSearched(true)

      // Phase 2: Background Hub revalidation (non-blocking)
      if (navigator.onLine) {
        const token = await useAuthSessionStore.getState().getAccessToken()
        if (token && !controller.signal.aborted) {
          const hubResults = await searchPatientsHub(q, getHubApiUrl(), token, controller.signal)
          if (!controller.signal.aborted) {
            // Merge: dedupe by id, prefer hub version
            const merged = new Map(localResults.map((p) => [p.id, p]))
            hubResults.forEach((p) => merged.set(p.id, p))
            setResults(Array.from(merged.values()))
          }
        }
      }
    } catch {
      // Search failed — keep local results
    } finally {
      if (!controller.signal.aborted) setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => performSearch(query), DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, performSearch])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  return { query, setQuery, results, isSearching, hasSearched }
}
