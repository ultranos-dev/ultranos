import Fuse, { type FuseResultMatch, type IFuseOptions } from 'fuse.js'
import { db } from './db'
import { searchLabsHub } from './trpc'
import type { LabDirectoryEntry } from '@ultranos/shared-types'

export interface LabSearchResult {
  item: LabDirectoryEntry
  matches: readonly FuseResultMatch[] | undefined
}

const fuseOptions: IFuseOptions<LabDirectoryEntry> = {
  keys: ['name', 'accreditationRef'],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 2,
}

/**
 * Hybrid lab search: Hub lab.searchDirectory API when online, falls back to the
 * local Dexie labsMirror when offline or on Hub failure.
 *
 * Highlighting (the <mark> on typed characters) is derived from Fuse match
 * indices — the same mechanism as the pharmacy search. Crucially, the Hub does
 * NOT return match indices, so we run a client-side Fuse pass over the result set
 * on EVERY path. This keeps highlighting working whether results came from the
 * Hub (online) or the mirror (offline):
 *   - Offline: Fuse over the whole mirror both filters/ranks AND highlights.
 *   - Online:  Fuse over the Hub's already-filtered rows highlights them without
 *              dropping any (a Hub row Fuse can't fuzzy-match keeps matches: undefined).
 */
export async function searchLabs(
  query: string,
  signal?: AbortSignal,
): Promise<LabSearchResult[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  let hubEntries: LabDirectoryEntry[] | null = null
  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      hubEntries = await searchLabsHub(trimmed, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // Network failure or Hub unavailable — fall through to the local mirror
    }
  }

  if (hubEntries !== null) {
    // Hub already filtered/ranked. Add highlight indices via a client-side Fuse
    // pass, but keep every Hub row (don't let Fuse's threshold drop results).
    const fuse = new Fuse(hubEntries, fuseOptions)
    const matchById = new Map(fuse.search(trimmed).map((r) => [r.item.id, r.matches]))
    return hubEntries.slice(0, 20).map((item) => ({ item, matches: matchById.get(item.id) }))
  }

  // Offline / Hub-unavailable fallback: Fuse over the local Dexie mirror.
  const entries = await db.labsMirror.toArray()
  const fuse = new Fuse(entries, fuseOptions)
  return fuse.search(trimmed, { limit: 20 }).map((r) => ({ item: r.item, matches: r.matches }))
}
