import Fuse from 'fuse.js'
import { db } from './db'
import { searchPharmaciesHub } from './trpc'
import type { PharmacyDirectoryEntry } from '@ultranos/shared-types'

/**
 * Hybrid pharmacy search: Hub pharmacy.search API when online,
 * falls back to Fuse.js over the local Dexie pharmaciesMirror when offline
 * or on Hub failure. Mirrors the searchMedications pattern.
 */
export async function searchPharmacies(
  query: string,
  signal?: AbortSignal,
): Promise<PharmacyDirectoryEntry[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      return await searchPharmaciesHub(trimmed, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // Network failure or Hub unavailable — fall through to local mirror
    }
  }

  // Offline / Hub-unavailable fallback: Fuse.js over the local Dexie mirror
  const entries = await db.pharmaciesMirror.toArray()
  const fuse = new Fuse(entries, {
    keys: ['name', 'address', 'province', 'district'],
    threshold: 0.4,
    minMatchCharLength: 2,
  })
  return fuse.search(trimmed, { limit: 20 }).map((r) => r.item)
}
