/**
 * ClinicalTerm — Wrapper for inline clinical terminology that must remain in English.
 *
 * Story 11.3 — Task 8: Clinical Terminology Exclusion
 *
 * Per PRD policy, the following ALWAYS render in English regardless of locale:
 * - Drug names (brand + generic)
 * - ICD-10 code descriptions
 * - LOINC codes
 * - FHIR resource names
 *
 * This component wraps clinical terms with `lang="en" dir="ltr"` to ensure:
 * - Screen readers announce in English
 * - Text direction is LTR even within an RTL context
 * - The term is visually distinct from surrounding translated text
 */

import type { ReactNode } from 'react'

export interface ClinicalTermProps {
  children: ReactNode
  /** Optional CSS class for styling */
  className?: string
}

export function ClinicalTerm({ children, className }: ClinicalTermProps) {
  return (
    <span lang="en" dir="ltr" style={{ unicodeBidi: 'isolate' }} className={className}>
      {children}
    </span>
  )
}
