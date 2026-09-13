import type { ReactNode } from 'react'
import { segmentsByIndices, segmentsByQuery, type HighlightSegment } from './highlight-core.js'

/**
 * Web (<mark>) character-level match highlighting for search-as-you-type dropdowns.
 * Segment logic is shared with the React Native highlighter via highlight-core, so
 * both platforms highlight identically. Two entry points:
 *
 *  - `highlightMatches(text, indices)` — for Fuse.js-backed searches (match indices).
 *  - `highlightQuery(text, query)` — for substring searches (no Fuse); highlights
 *    every case-insensitive occurrence of the typed query.
 */

export { getMatchIndices } from './highlight-core.js'

const MARK_CLASS = 'bg-warning/30 text-foreground rounded-sm ps-0.5 pe-0.5'

function render(segments: HighlightSegment[]): ReactNode {
  return (
    <>
      {segments.map((s, i) =>
        s.highlighted ? (
          <mark key={i} className={MARK_CLASS}>
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

/** Wrap Fuse-matched substrings of `text` in <mark>. Returns plain text when no indices. */
export function highlightMatches(
  text: string,
  indices: readonly [number, number][] | undefined,
): ReactNode {
  return render(segmentsByIndices(text, indices))
}

/** Highlight every case-insensitive occurrence of `query` (a substring) in `text`. */
export function highlightQuery(text: string, query: string): ReactNode {
  return render(segmentsByQuery(text, query))
}
