import type { DrugLocalizedText } from '@ultranos/shared-types'
import type { Lang } from '@/store/lang-store'

export interface LocalizedResult {
  /** The text to display. */
  text: string
  /**
   * True only when `text` is the value for the requested `lang` (i.e. it is in
   * that language's script). False when we fell back to English — callers must
   * NOT apply the Arabic font / RTL alignment to a fallback, or English glyphs
   * render in an Arabic face. English itself is reported as non-localized.
   */
  isLocalized: boolean
}

/**
 * Resolve a FHIR-style localized text field to a display string, reporting
 * whether the result is genuinely in the requested language or an English
 * fallback. The data model only declares en/prs/ps, but synced rows may carry
 * additional keys (e.g. `ar`), so we read the key dynamically.
 */
export function resolveLocalized(
  field: DrugLocalizedText | undefined,
  lang: Lang,
): LocalizedResult {
  if (!field) return { text: '', isLocalized: false }
  const direct = (field as Record<string, string | undefined>)[lang]
  if (direct) return { text: direct, isLocalized: lang !== 'en' }
  return { text: field.en ?? '', isLocalized: false }
}
