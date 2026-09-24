/**
 * Lab-Lite feature flags (Story 63.2)
 *
 * Central, env-driven flags that gate PLACEHOLDER clinical content off by
 * default. A clinical reference tool must never present scaffolding (gray-square
 * photomicrographs, `[TRANSLATE]`-marked guidance) as if it were reviewed
 * clinical truth — but the underlying data and code paths are preserved, so each
 * gate is fully REVERSIBLE by flipping the flag (no feature is removed).
 *
 * Defaults (all "hidden"):
 *   - showPlaceholderAtlasEntries: false
 *       Visual Atlas entries whose image is the 1×1 gray PLACEHOLDER_JPEG or
 *       whose author is the "Dr. A. Placeholder" stub are hidden behind a
 *       per-subcategory "content pending" state until real, physician-attributed
 *       photomicrographs land.
 *   - showUntranslatedGuidanceLocales: false
 *       Public-health guidance locale entries still carrying a `[TRANSLATE]`
 *       marker (or an empty audio field) are hidden per-locale behind a
 *       "translation pending" state — the app never renders a raw `[TRANSLATE]`
 *       string, and never silently falls back to English for a language the
 *       patient expects (a misleading English block is worse than an honest
 *       pending state).
 *
 * To reveal placeholder/untranslated content (e.g. for internal content review),
 * set the corresponding NEXT_PUBLIC_* env var to 'true' at build time. Missing /
 * malformed values keep the safe default (hidden).
 */

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false
  return defaultValue
}

export interface LabFeatureFlags {
  /** Reveal placeholder Visual Atlas entries (gray-square images / stub author). Default: false. */
  showPlaceholderAtlasEntries: boolean
  /** Reveal guidance locale entries still marked `[TRANSLATE]` / missing audio. Default: false. */
  showUntranslatedGuidanceLocales: boolean
}

/**
 * Resolve the active feature flags. Env-driven and evaluated per-call so tests
 * can stub `process.env`. No PHI, no network — pure config.
 */
export function getFeatureFlags(): LabFeatureFlags {
  return {
    showPlaceholderAtlasEntries: envFlag(
      process.env.NEXT_PUBLIC_LAB_SHOW_PLACEHOLDER_ATLAS,
      false,
    ),
    showUntranslatedGuidanceLocales: envFlag(
      process.env.NEXT_PUBLIC_LAB_SHOW_UNTRANSLATED_GUIDANCE,
      false,
    ),
  }
}

/** Convenience accessor for the atlas placeholder gate. */
export function showPlaceholderAtlasEntries(): boolean {
  return getFeatureFlags().showPlaceholderAtlasEntries
}

/** Convenience accessor for the guidance translation gate. */
export function showUntranslatedGuidanceLocales(): boolean {
  return getFeatureFlags().showUntranslatedGuidanceLocales
}

// ---------------------------------------------------------------------------
// Content-classification helpers (kept flag-agnostic so callers can decide)
// ---------------------------------------------------------------------------

/** The `[TRANSLATE]` marker prefix used in guidance seed data for untranslated copy. */
export const TRANSLATE_MARKER = '[TRANSLATE]'

/** True if a guidance text string is an untranslated placeholder. */
export function isUntranslatedText(text: string | undefined | null): boolean {
  return !!text && text.includes(TRANSLATE_MARKER)
}
