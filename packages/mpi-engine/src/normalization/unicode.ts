export function nfdNormalize(input: string): string {
  return input.normalize('NFD')
}

export type Script = 'arabic' | 'latin' | 'mixed' | 'empty'

// Returns true if a single character is in the Arabic Unicode ranges
// (including Arabic Extended, Dari/Pashto, Arabic Presentation Forms).
export function isArabicChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x0600 && code <= 0x06FF) ||
    (code >= 0x0750 && code <= 0x077F) ||
    (code >= 0x08A0 && code <= 0x08FF) ||
    (code >= 0xFB50 && code <= 0xFDFF) ||
    (code >= 0xFE70 && code <= 0xFEFF)
  )
}

export function detectScript(input: string): Script {
  const trimmed = input.trim()
  if (!trimmed) return 'empty'
  const chars = [...trimmed]
  const hasArabic = chars.some(isArabicChar)
  const hasLatin = /[a-zA-Z]/.test(trimmed)
  if (hasArabic && hasLatin) return 'mixed'
  if (hasArabic) return 'arabic'
  if (hasLatin) return 'latin'
  return 'empty'
}
