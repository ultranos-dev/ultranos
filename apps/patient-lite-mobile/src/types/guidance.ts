/**
 * Public Health Guidance — Shared Types for Patient-Lite Mobile
 *
 * Story 53.7 — AC: 3, 4, 10
 *
 * Type definitions for physician-authored guidance content displayed in the
 * patient-facing app. These mirror the GuidanceContent shape from lab-lite
 * (apps/lab-lite/src/lib/public-health-guidance.ts) but are defined here
 * independently to avoid cross-app imports between React Native and Next.js.
 *
 * No PHI — these types describe static physician-authored content only.
 */

export type GuidanceLocale = 'en' | 'ar' | 'prs' | 'ps'

export interface GuidanceLocalizedText {
  en: string
  ar: string
  prs: string
  ps: string
}

export interface GuidanceStep {
  order: number
  /** Icon identifier (maps to emoji/symbol in GuidanceStepCard) */
  icon: string
  text: GuidanceLocalizedText
}

export interface GuidanceAuthor {
  name: string
  credentials: string
  institution: string
}

/**
 * Bundled guidance content for offline display in Patient-Lite.
 * Matches GuidanceContent shape from lab-lite (without the `aiGenerated` sentinel,
 * which is a lab-lite content-model guard, not needed at display time).
 */
export interface GuidanceContentBundle {
  id: string
  conditionCode: string
  conditionDisplay: string
  text: GuidanceLocalizedText
  audio: GuidanceLocalizedText
  steps: GuidanceStep[]
  author: GuidanceAuthor
  version: string
  lastReviewedAt: string
  approvedBy: string
}
