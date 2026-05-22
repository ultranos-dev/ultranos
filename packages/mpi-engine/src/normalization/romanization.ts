import { ROMANIZATION_TABLE } from './romanization-table.js'

/**
 * Romanize an Arabic-script string to Latin using the ALA-LC table.
 * Unknown characters are silently dropped (they should not corrupt MPI output).
 * Spaces and hyphens pass through unchanged.
 */
export function romanizeArabic(input: string): string {
  let result = ''
  for (const char of input) {
    const mapped = ROMANIZATION_TABLE.get(char)
    if (mapped !== undefined) {
      result += mapped
    } else if (char === ' ' || char === '-') {
      result += char
    }
    // Unknown characters (punctuation, numbers in names) silently dropped
  }
  return result
}
