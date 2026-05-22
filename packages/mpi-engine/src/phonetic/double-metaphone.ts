// double-metaphone@1.x is CJS — default import works via Node ESM interop.
// double-metaphone@2.x is pure ESM — use named import: import { doubleMetaphone } from 'double-metaphone'
// This package is pinned to 1.x; do not bump to 2.x without updating this import.
import doubleMetaphone from 'double-metaphone'

/**
 * Compute Double Metaphone phonetic tokens from a normalized Latin name string.
 * Input MUST be pre-normalized via normalizeNameComponent().
 * Returns a deduplicated array of 1–2 token strings per word.
 */
export function computePhoneticTokens(normalized: string): string[] {
  if (!normalized.trim()) return []

  const words = normalized.split(/\s+/).filter(Boolean)
  const tokens = new Set<string>()

  for (const word of words) {
    const result = doubleMetaphone(word) as [string, string]
    const [primary, secondary] = result
    if (primary) tokens.add(primary)
    if (secondary && secondary !== primary) tokens.add(secondary)
  }

  return [...tokens]
}
