'use client'

import { getDb } from '@/lib/db'
import { searchPatients } from '@/lib/trpc'
import type { PatientSearchItem } from '@/hooks/usePatientSearch'
import type {
  PatientSearchResponse,
  PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'

function toResult(item: PatientSearchItem): PatientSearchResult {
  return {
    id: item.id,
    displayName: item.firstName,
    // List-tier (Rule #7): first name + age only — no gender/phone on this surface.
    ageLabel: item.age ? `${item.age}y` : '',
    photoUrl: item.photoUrl ?? null,
    raw: item,
  }
}

/**
 * Lab-lite `search` adapter factory (token-bound) for the shared `PatientSearchBar`.
 * Local Dexie (name substring) + Hub revalidation, kept at the LIST TIER per Rule #7
 * (first name + age + opaque blind-index ref only). Hub failure → `hubUnavailable`.
 */
export function makePatientSearchAdapter(token: string) {
  return async (query: string, signal: AbortSignal): Promise<PatientSearchResponse> => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return { results: [] }
    const lower = trimmed.toLowerCase()
    const merged = new Map<string, PatientSearchResult>()

    // Phase 1: local Dexie.
    try {
      const db = getDb()
      const locals = await db
        .table('patients')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => {
          const nameLocal = p._ultranos?.nameLocal?.toLowerCase() ?? ''
          const nameGiven = p._ultranos?.nameGiven?.toLowerCase() ?? ''
          const nameLatin = p._ultranos?.nameLatin?.toLowerCase() ?? ''
          return nameLocal.includes(lower) || nameGiven.includes(lower) || nameLatin.includes(lower)
        })
        .limit(20)
        .toArray()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of locals as any[]) {
        const birthYear = p._ultranos?.birthYear ?? (p.birthDate ? parseInt(p.birthDate.slice(0, 4)) : undefined)
        const age = birthYear ? new Date().getFullYear() - birthYear : 0
        merged.set(p.id, toResult({
          id: p.id,
          firstName: p._ultranos?.nameGiven ?? p.name?.[0]?.given?.[0] ?? '',
          age,
          photoUrl: null,
          source: 'local',
        }))
      }
    } catch {
      // IndexedDB unavailable — fall through to the Hub phase.
    }

    // Phase 2: Hub revalidation (opaque blind-index refs, never UUIDs).
    let hubUnavailable = false
    if (token) {
      try {
        const hub = await searchPatients(trimmed, token)
        if (!signal.aborted) {
          for (const r of hub) {
            merged.set(r.ref, toResult({
              id: r.ref,
              firstName: r.firstName,
              age: r.age ?? 0,
              photoUrl: r.photoUrl ?? null,
              source: 'remote',
            }))
          }
        }
      } catch {
        if (!signal.aborted) hubUnavailable = true
      }
    }

    return { results: Array.from(merged.values()), hubUnavailable }
  }
}
