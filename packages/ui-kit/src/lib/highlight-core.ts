/**
 * Platform-agnostic core for search-match highlighting. Pure functions (no JSX,
 * no React Native) so both the web (<mark>) and native (<Text>) highlighters can
 * share the exact same segment logic — and so it's trivially unit-testable.
 */

export interface HighlightSegment {
  text: string
  highlighted: boolean
}

/** A structural view of a Fuse match — avoids importing fuse.js into ui-kit. */
interface MatchLike {
  readonly key?: string
  readonly indices?: ReadonlyArray<readonly [number, number]>
}

/** Indices for a given match key (e.g. 'display', 'name', 'code'). */
export function getMatchIndices(
  matches: ReadonlyArray<MatchLike> | undefined,
  key: string,
): readonly [number, number][] | undefined {
  return matches?.find((m) => m.key === key)?.indices as readonly [number, number][] | undefined
}

function mergeIndices(indices: readonly [number, number][]): [number, number][] {
  const sorted = [...indices].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

/** Split `text` into segments given Fuse match index ranges (inclusive). */
export function segmentsByIndices(
  text: string,
  indices: readonly [number, number][] | undefined,
): HighlightSegment[] {
  if (!indices || indices.length === 0) return [{ text, highlighted: false }]
  const safe = mergeIndices(indices)
  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const [start, end] of safe) {
    const clampedStart = Math.max(start, cursor)
    if (clampedStart > cursor) segments.push({ text: text.slice(cursor, clampedStart), highlighted: false })
    segments.push({ text: text.slice(clampedStart, end + 1), highlighted: true })
    cursor = end + 1
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false })
  return segments
}

/** Split `text` into segments, highlighting every case-insensitive occurrence of `query`. */
export function segmentsByQuery(text: string, query: string): HighlightSegment[] {
  const q = query.trim()
  if (!q) return [{ text, highlighted: false }]
  const lowerText = text.toLowerCase()
  const lowerQ = q.toLowerCase()
  let idx = lowerText.indexOf(lowerQ)
  if (idx === -1) return [{ text, highlighted: false }]
  const segments: HighlightSegment[] = []
  let cursor = 0
  while (idx !== -1) {
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), highlighted: false })
    segments.push({ text: text.slice(idx, idx + q.length), highlighted: true })
    cursor = idx + q.length
    idx = lowerText.indexOf(lowerQ, cursor)
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false })
  return segments
}
