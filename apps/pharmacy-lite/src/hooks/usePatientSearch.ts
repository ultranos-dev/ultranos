import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPatientsLocal, searchPatientsHub, SESSION_REQUIRED_ERROR } from '@/lib/patient-search'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
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
  /** Set to "Session required for patient search" when encryption key is unavailable. */
  searchError: string | null
}

export function usePatientSearch(): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalPatient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setHasSearched(false)
      setSearchError(null)
      return
    }

    // Guard: encryption key must be available before any Dexie access.
    if (!encryptionKeyStore.isReady()) {
      setResults([])
      setIsSearching(false)
      setHasSearched(true)
      setSearchError(SESSION_REQUIRED_ERROR)
      return
    }

    setIsSearching(true)
    setSearchError(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Phase 1: Fast local in-memory decrypt-and-filter search
      const localResults = await searchPatientsLocal(q)
      // Guard: a newer search may have aborted this one while Phase 1 was running.
      if (controller.signal.aborted) return
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
      // Search failed — keep local results; no PHI in error state
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

  return { query, setQuery, results, isSearching, hasSearched, searchError }
}
