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
  search: (query: string) => Promise<void>
  clear: () => void
}

export function usePatientSearch(token: string): UsePatientSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSearchItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    const trimmed = q.trim()

    if (trimmed.length < 2) {
      setResults([])
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
          ...r,
          source: 'remote' as const,
        }))

        // Merge: deduplicate by ID, prefer remote
        setResults((prev) => {
          const merged = new Map<string, PatientSearchItem>()
          for (const item of prev) merged.set(item.id, item)
          for (const item of hubItems) merged.set(item.id, item)
          return Array.from(merged.values())
        })
      } catch {
        // Offline-safe: keep local results
      }
    }

    setIsSearching(false)
  }, [token])

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    abortRef.current?.abort()
  }, [])

  return { query, results, isSearching, search, clear }
}
