'use client'

import { useState, useCallback, useRef } from 'react'
import { getDb } from '@/lib/db'
import { searchPatients } from '@/lib/trpc'

export interface PatientSearchItem {
  id: string
  firstName: string
  age: number
  gender?: string
  phone?: string
  source: 'local' | 'remote'
}

interface UsePatientSearchReturn {
  query: string
  results: PatientSearchItem[]
  isSearching: boolean
  /** Non-null when the Hub search failed (offline / server error). Local results are still shown. */
  hubError: string | null
  search: (query: string) => Promise<void>
  clear: () => void
}

export function usePatientSearch(token: string): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSearchItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hubError, setHubError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    const trimmed = q.trim()

    if (trimmed.length < 2) {
      setResults([])
      setHubError(null)
      return
    }

    setIsSearching(true)

    // Phase 1: Local Dexie search (immediate)
    try {
      const db = getDb()
      const localPatients = await db
        .table('patients')
        .filter((p: any) => {
          const nameLocal = p._ultranos?.nameLocal?.toLowerCase() ?? ''
          const nameGiven = p._ultranos?.nameGiven?.toLowerCase() ?? ''
          const nameLatin = p._ultranos?.nameLatin?.toLowerCase() ?? ''
          const lower = trimmed.toLowerCase()
          return nameLocal.includes(lower) || nameGiven.includes(lower) || nameLatin.includes(lower)
        })
        .limit(20)
        .toArray()

      const localItems: PatientSearchItem[] = localPatients.map((p: any) => {
        const birthYear = p._ultranos?.birthYear ?? (p.birthDate ? parseInt(p.birthDate.slice(0, 4)) : undefined)
        const age = birthYear ? new Date().getFullYear() - birthYear : 0
        return {
          id: p.id,
          firstName: p._ultranos?.nameGiven ?? p.name?.[0]?.given?.[0] ?? '',
          age,
          gender: p.gender,
          phone: p.telecom?.find((t: any) => t.system === 'phone')?.value,
          source: 'local' as const,
        }
      })
      setResults(localItems)
    } catch {
      // IndexedDB unavailable — continue to Hub phase
    }

    // Phase 2: Hub revalidation (background, non-blocking)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    if (token) {
      try {
        const hubResults = await searchPatients(trimmed, token)
        const hubItems: PatientSearchItem[] = hubResults.map((r) => ({
          // Rule #7: the hub returns the opaque blind-index ref, never a UUID.
          id: r.ref,
          firstName: r.firstName,
          age: r.age ?? 0,
          source: 'remote' as const,
        }))

        // Merge: deduplicate by ID, prefer remote
        setResults((prev) => {
          const merged = new Map<string, PatientSearchItem>()
          for (const item of prev) merged.set(item.id, item)
          for (const item of hubItems) merged.set(item.id, item)
          return Array.from(merged.values())
        })
        setHubError(null)
      } catch (err) {
        // Story 59.1 (AC 4): the Hub failure is SURFACED — local results remain
        // usable, but the caller can tell the user the online search failed
        // (previously a silent catch masked every 404/network error).
        setHubError(err instanceof Error ? err.message : 'Hub search failed')
      }
    }

    setIsSearching(false)
  }, [token])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setHubError(null)
    abortRef.current?.abort()
  }, [])

  return { query, results, isSearching, hubError, search, clear }
}
