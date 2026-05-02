import { z } from 'zod'
import { db } from './db'
import type { VocabMedicationEntry, VocabIcd10Entry, VocabInteractionEntry } from './db'
import { invalidateInteractionCache } from '@/services/interactionService'

type VocabType = 'medications' | 'icd10' | 'interactions'

const VERSION_STORAGE_KEY = 'ultranos:vocab-version'

// ── Zod schemas for runtime validation of server-delivered entries (P7) ──────

const MedicationEntrySchema = z.object({
  code: z.string().min(1),
  display: z.string().min(1),
  form: z.string(),
  strength: z.string(),
  version: z.number().int().positive(),
})

const Icd10EntrySchema = z.object({
  code: z.string().min(1),
  display: z.string().min(1),
  version: z.number().int().positive(),
})

const InteractionEntrySchema = z.object({
  drugA: z.string().min(1),
  drugB: z.string().min(1),
  severity: z.string().min(1),
  description: z.string(),
  version: z.number().int().positive(),
})

type ValidInteractionEntry = z.infer<typeof InteractionEntrySchema>

// ─────────────────────────────────────────────────────────────────────────────

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

// P9 — URL construction: normalize base URL and build sync endpoint safely
function buildSyncUrl(type: VocabType, sinceVersion: number): URL {
  const base = getHubApiUrl().replace(/\/+$/, '') // strip trailing slashes
  const url = new URL(`${base}/vocabulary.sync`)
  url.searchParams.set('input', JSON.stringify({ json: { type, sinceVersion } }))
  return url
}

function getLocalVersion(type: VocabType): number {
  try {
    const stored = localStorage.getItem(`${VERSION_STORAGE_KEY}:${type}`)
    return stored ? parseInt(stored, 10) : 0
  } catch {
    return 0
  }
}

function setLocalVersion(type: VocabType, version: number): void {
  try {
    localStorage.setItem(`${VERSION_STORAGE_KEY}:${type}`, String(version))
  } catch {
    // localStorage unavailable — version tracking degraded but not fatal
  }
}

// P6 — Guard against localStorage/IndexedDB desync after site-data clear
async function getTableCount(type: VocabType): Promise<number> {
  switch (type) {
    case 'medications': return db.vocabularyMedications.count()
    case 'icd10': return db.vocabularyIcd10.count()
    case 'interactions': return db.vocabularyInteractions.count()
  }
}

async function getEffectiveSinceVersion(type: VocabType): Promise<number> {
  const stored = getLocalVersion(type)
  if (stored === 0) return 0
  // Verify local table isn't empty (handles localStorage/IndexedDB desync)
  const count = await getTableCount(type)
  return count > 0 ? stored : 0
}

async function fetchVocabDelta(
  type: VocabType,
  sinceVersion: number,
  token?: string,
): Promise<{ entries: Record<string, unknown>[]; latestVersion: number }> {
  // P9 — use buildSyncUrl for safe URL construction
  const url = buildSyncUrl(type, sinceVersion)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url.toString(), { method: 'GET', headers })

  // P17 — verified: res.ok check is already before res.json(), which is correct
  if (!res.ok) {
    throw new Error(`Vocabulary sync failed: ${res.status}`)
  }

  const body = await res.json() as {
    result: { data: { json: { entries: Record<string, unknown>[]; latestVersion: number } } }
  }
  return body.result.data.json
}

// P7 — Validate and filter medication entries; log skipped count (no PHI)
async function applyMedicationUpdates(entries: Record<string, unknown>[]): Promise<void> {
  const valid = entries.flatMap((e) => {
    const parsed = MedicationEntrySchema.safeParse(e)
    return parsed.success ? [parsed.data] : []
  })
  if (valid.length < entries.length) {
    console.warn(`[vocab-sync] Skipped ${entries.length - valid.length} invalid medication entries`)
  }
  await db.vocabularyMedications.bulkPut(valid as VocabMedicationEntry[])
  // P24 — invalidate interaction cache when medication display names may have changed
  invalidateInteractionCache()
}

// P7 — Validate and filter ICD-10 entries; log skipped count (no PHI)
async function applyIcd10Updates(entries: Record<string, unknown>[]): Promise<void> {
  const valid = entries.flatMap((e) => {
    const parsed = Icd10EntrySchema.safeParse(e)
    return parsed.success ? [parsed.data] : []
  })
  if (valid.length < entries.length) {
    console.warn(`[vocab-sync] Skipped ${entries.length - valid.length} invalid ICD-10 entries`)
  }
  await db.vocabularyIcd10.bulkPut(valid as VocabIcd10Entry[])
}

// P7 + P8 — Validate entries, then batch upsert inside a single Dexie transaction
async function applyInteractionUpdates(entries: Record<string, unknown>[]): Promise<void> {
  // P7 — validate first
  const valid: ValidInteractionEntry[] = entries.flatMap((e) => {
    const parsed = InteractionEntrySchema.safeParse(e)
    return parsed.success ? [parsed.data] : []
  })
  if (valid.length < entries.length) {
    console.warn(`[vocab-sync] Skipped ${entries.length - valid.length} invalid interaction entries`)
  }

  if (valid.length === 0) return

  // P8 — single toArray() + in-memory map + transaction (was O(N) sequential reads)
  await db.transaction('rw', db.vocabularyInteractions, async () => {
    // Load all existing entries once
    const existing = await db.vocabularyInteractions.toArray()
    const existingMap = new Map<string, number>() // "drugA|drugB" → id
    for (const row of existing) {
      if (row.id !== undefined) {
        existingMap.set(`${row.drugA.toLowerCase()}|${row.drugB.toLowerCase()}`, row.id)
        existingMap.set(`${row.drugB.toLowerCase()}|${row.drugA.toLowerCase()}`, row.id)
      }
    }

    for (const e of valid) {
      const key = `${e.drugA.toLowerCase()}|${e.drugB.toLowerCase()}`
      const existingId = existingMap.get(key)
      if (existingId !== undefined) {
        await db.vocabularyInteractions.update(existingId, {
          severity: e.severity,
          description: e.description,
          version: e.version,
        })
      } else {
        await db.vocabularyInteractions.add({
          drugA: e.drugA,
          drugB: e.drugB,
          severity: e.severity,
          description: e.description,
          version: e.version,
        })
      }
    }
  })

  invalidateInteractionCache()
}

/**
 * Sync a single vocabulary type from the Hub.
 * Returns true if new entries were applied, false if already up-to-date.
 * Always updates the local version so the Hub's progress is never lost (P19).
 */
async function syncVocabType(type: VocabType, token?: string): Promise<boolean> {
  // P6 — use getEffectiveSinceVersion to handle localStorage/IndexedDB desync
  const localVersion = await getEffectiveSinceVersion(type)
  const { entries, latestVersion } = await fetchVocabDelta(type, localVersion, token)

  if (entries.length > 0) {
    switch (type) {
      case 'medications':
        await applyMedicationUpdates(entries)
        break
      case 'icd10':
        await applyIcd10Updates(entries)
        break
      case 'interactions':
        await applyInteractionUpdates(entries)
        break
    }
  }

  // P19 — always update local version even when there are no new entries;
  // Hub may have advanced its version without sending us any entries.
  setLocalVersion(type, latestVersion)
  return entries.length > 0
}

/**
 * Sync all vocabulary types from the Hub.
 * Non-blocking — app works with stale vocabulary while sync runs in background.
 * Call this after auth on app startup.
 *
 * P4 — returns { succeeded, failed } instead of swallowing all errors.
 * Throws only if ALL three types failed (indicates Hub/DB unavailability).
 */
export async function syncAllVocabulary(
  token?: string,
): Promise<{ succeeded: VocabType[]; failed: VocabType[] }> {
  const types: VocabType[] = ['medications', 'icd10', 'interactions']

  const results = await Promise.allSettled(
    types.map((type) => syncVocabType(type, token)),
  )

  const succeeded: VocabType[] = []
  const failed: VocabType[] = []

  for (let i = 0; i < types.length; i++) {
    if (results[i].status === 'fulfilled') {
      succeeded.push(types[i])
    } else {
      failed.push(types[i])
    }
  }

  // Total failure = database / Hub unreachable — surface this to the caller
  if (failed.length === types.length) {
    throw new Error('[vocab-sync] All vocabulary sync types failed — Hub may be unreachable')
  }

  return { succeeded, failed }
}
