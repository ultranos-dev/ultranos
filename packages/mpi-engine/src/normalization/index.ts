import { nfdNormalize, detectScript, isArabicChar } from './unicode.js'
import { romanizeArabic } from './romanization.js'
import { applyVariants } from './variants.js'

export { computePhoneticTokens } from '../phonetic/index.js'

/**
 * Normalize a single name component (given, father, or grandfather name)
 * to a canonical Latin string for Jaro-Winkler comparison.
 *
 * Pipeline:
 *   NFD normalize → detect script → ALA-LC romanize (Arabic)
 *   → lowercase → strip NFD combining marks → collapse whitespace → apply variants
 *
 * Both "محمد" and "Mohammed" and "Muhammad" produce "muhammad".
 */
export function normalizeNameComponent(input: string): string {
  if (!input || !input.trim()) return ''

  const nfd = nfdNormalize(input.trim())
  const script = detectScript(nfd)

  let latin: string
  if (script === 'arabic') {
    latin = romanizeArabic(nfd)
  } else if (script === 'mixed') {
    // Romanize Arabic characters; Latin characters pass through unchanged
    latin = [...nfd].map(ch => (isArabicChar(ch) ? romanizeArabic(ch) : ch)).join('')
  } else if (script === 'empty') {
    return ''
  } else {
    latin = nfd
  }

  // Lowercase, strip any NFD combining characters that survive (e.g., accents on Latin)
  latin = latin.toLowerCase().replace(/\p{Mn}/gu, '')

  // Collapse whitespace and trim
  latin = latin.replace(/\s+/g, ' ').trim()

  // Apply variant normalization (Mohammad→muhammad, etc.)
  return applyVariants(latin)
}
