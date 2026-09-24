/**
 * Public Health Guidance — Data Model
 *
 * Story 53.7 — AC: 2, 3, 5, 6, 7
 *
 * IMPORTANT: All guidance content is physician-authored. These are pre-written,
 * reviewed, and versioned clinical scripts — NOT AI-generated. No AI confirmation
 * gate applies (CLAUDE.md: "All AI-generated clinical content requires a physician
 * confirmation gate" — N/A here; no AI involved).
 *
 * PHI note: GuidanceContent contains NO patient data. The trigger engine receives
 * only structured numeric/string values keyed by field codes. No patient identifiers
 * are ever present in this module.
 */

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------

export type GuidanceLocale = 'en' | 'ar' | 'prs' | 'ps'

// ---------------------------------------------------------------------------
// Multilingual text container
// ---------------------------------------------------------------------------

export interface GuidanceLocalizedText {
  en: string
  ar: string
  prs: string
  ps: string
}

// ---------------------------------------------------------------------------
// Step — one actionable instruction shown as a numbered card
// ---------------------------------------------------------------------------

export interface GuidanceStep {
  order: number
  /** Icon identifier (maps to a recognizable symbol: bed, medicine, water, family, etc.) */
  icon: string
  text: GuidanceLocalizedText
}

// ---------------------------------------------------------------------------
// Author — physician who authored and approved the content
// ---------------------------------------------------------------------------

export interface GuidanceAuthor {
  name: string
  credentials: string
  institution: string
}

// ---------------------------------------------------------------------------
// GuidanceContent — the full physician-authored record for one condition
// ---------------------------------------------------------------------------

export interface GuidanceContent {
  /** Stable opaque ID, e.g. 'PHG-MALARIA-001' */
  id: string
  /** Condition code, e.g. 'MALARIA_POSITIVE' — mapped by trigger engine */
  conditionCode: string
  /** i18n key for condition display name */
  conditionDisplay: string

  /** Full guidance prose in all four languages */
  text: GuidanceLocalizedText

  /**
   * Audio references — base64-encoded MP3 (≤500 KB) or empty string when
   * recordings have not yet been provided. Empty string = silent; UI must
   * hide the audio button when the field is empty.
   */
  audio: GuidanceLocalizedText

  /** Structured actionable steps for the numbered-step card display */
  steps: GuidanceStep[]

  /** Physician authorship — REQUIRED, non-empty. Absence means content must not be shown. */
  author: GuidanceAuthor
  /** semver, e.g. '1.0.0' */
  version: string
  /** ISO 8601 date of last physician review */
  lastReviewedAt: string
  /** Reviewing authority (institution or committee name) */
  approvedBy: string

  /**
   * Explicit sentinel: guidance content is NEVER AI-generated.
   * This field must be absent or false. Any truthy value is a bug.
   */
  aiGenerated?: false
}

// ---------------------------------------------------------------------------
// GuidanceTrigger — maps a result condition to a GuidanceContent ID
// ---------------------------------------------------------------------------

export type GuidanceTriggerOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'positive'

export interface GuidanceTrigger {
  /** Stable opaque ID, e.g. 'GT-MALARIA-001' */
  id: string
  /** References GuidanceContent.conditionCode */
  conditionCode: string
  triggerType: 'result_value' | 'result_code'
  /** Which test template this trigger applies to (LOINC code, or '*' for any) */
  templateLoincCode: string
  /** Specific field code within the result (for value-based triggers) */
  fieldCode?: string
  /** Comparison operator */
  operator?: GuidanceTriggerOperator
  /** Threshold or code value to compare against */
  value?: string | number
}

// ---------------------------------------------------------------------------
// Locale resolution with translation gate (Story 63.2, AC2)
// ---------------------------------------------------------------------------

import { isUntranslatedText, showUntranslatedGuidanceLocales } from '@/lib/feature-flags'

/**
 * Resolved guidance text for a single locale.
 * `pending: true` means the requested locale's translation is not yet available
 * (still carries the `[TRANSLATE]` marker). The UI must render a "translation
 * pending" state — NEVER the raw `[TRANSLATE]…` string, and NEVER a silent
 * English fallback for a language the patient expects (a misleading English
 * block is worse than an honest pending state — decision recorded in the story).
 */
export interface ResolvedGuidanceLocale {
  /** True when the locale's content is not yet translated (hidden). */
  pending: boolean
  /** The displayable text for the locale, or null when pending. */
  text: string | null
  /** The audio reference for the locale, or null when absent/pending. */
  audio: string | null
}

/**
 * Resolve one locale of a localized guidance text container, applying the
 * translation gate. When the locale is untranslated (`[TRANSLATE]` marker) and
 * the reveal flag is off (default), returns `{ pending: true, text: null }`.
 *
 * Audio is treated as pending/absent whenever the string is empty OR the text
 * itself is still pending (no point playing audio for untranslated copy).
 */
export function resolveGuidanceLocale(
  text: GuidanceLocalizedText,
  audio: GuidanceLocalizedText,
  locale: GuidanceLocale,
): ResolvedGuidanceLocale {
  const rawText = text[locale] ?? ''
  const rawAudio = audio[locale] ?? ''
  const untranslated = isUntranslatedText(rawText)

  if (untranslated && !showUntranslatedGuidanceLocales()) {
    return { pending: true, text: null, audio: null }
  }

  // Revealed (flag on) or already translated: strip a leading marker defensively
  // so a raw "[TRANSLATE]" token can never reach the UI even when revealed.
  const cleanText = rawText.replace(/^\s*\[TRANSLATE\]\s*/, '')
  return {
    pending: false,
    text: cleanText.length > 0 ? cleanText : null,
    audio: rawAudio.length > 0 ? rawAudio : null,
  }
}
