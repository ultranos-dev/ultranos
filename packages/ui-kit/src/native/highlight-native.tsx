import { Text } from 'react-native'
import type { ReactNode } from 'react'
import { segmentsByQuery } from '../lib/highlight-core'
import { Colors } from '../tokens.native'

/**
 * React Native analogue of the web `highlightQuery` — returns children to place
 * INSIDE an existing <Text>, highlighting every case-insensitive occurrence of
 * `query` with an amber background. Shares segment logic with the web highlighter
 * via highlight-core.
 *
 * Returns the plain string (not wrapped) when there is no match, so it drops into
 * a <Text> transparently and callers that inspect `.props.children` still see the
 * original string when nothing is highlighted.
 */
export function highlightNativeName(
  value: string,
  query: string,
  color: string = Colors.warningLight,
): ReactNode {
  const segments = segmentsByQuery(value, query)
  if (segments.length === 1 && !segments[0]!.highlighted) return value
  return segments.map((seg, i) =>
    seg.highlighted ? (
      <Text key={i} style={{ backgroundColor: color }}>
        {seg.text}
      </Text>
    ) : (
      <Text key={i}>{seg.text}</Text>
    ),
  )
}
