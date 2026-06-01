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

export type GuidanceTriggerOperator = 'eq' | 'gt' | 'gte' | 'positive'

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
