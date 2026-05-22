// If the import below fails, try: import { doubleMetaphone } from 'double-metaphone'
// The package exports differ between CJS and ESM builds.
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
