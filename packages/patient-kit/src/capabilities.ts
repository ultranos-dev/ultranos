/**
 * Capability presets + tier→capabilities mapping for the shared patient form.
 *
 * The AUTHORITATIVE access decision is made Hub-side (`resolvePatientAccess`, Phase 2).
 * This module mirrors that decision into form capabilities so the UI renders the right
 * sections/read-only state from a SINGLE source — never per-app `if` branches.
 */

import type {
  PatientFormCapabilities,
  PatientFormSection,
  SectionVisibility,
} from './types.js'

/**
 * Access tiers (aligned with docs/patient-workflow-standardization-v1.md §3.2):
 * - FULL       same-org clinician/admin — full record incl. edit
 * - CLINICAL   same-org clinical roles INCL. lab — full clinical, real patient ref
 * - MINIMIZED  cross-org lab (no consent) / pre-relationship verify-before-claim
 * - CONTINUITY cross-org, consented — read-only continuity of care
 * - NONE       no relationship / withdrawn consent — 403 (form not shown)
 */
export type AccessTier = 'FULL' | 'CLINICAL' | 'MINIMIZED' | 'CONTINUITY' | 'NONE'

const ALL_SECTIONS: PatientFormSection[] = [
  'photo',
  'identity',
  'demographics',
  'nationalId',
  'contact',
  'address',
  'social',
  'allergies',
  'vitals',
  'consent',
]

function sections(
  fill: SectionVisibility,
  overrides: Partial<Record<PatientFormSection, SectionVisibility>> = {},
): Record<PatientFormSection, SectionVisibility> {
  const base = Object.fromEntries(ALL_SECTIONS.map((s) => [s, fill])) as Record<
    PatientFormSection,
    SectionVisibility
  >
  return { ...base, ...overrides }
}

/** FULL / CLINICAL (same-org, incl. lab): every section editable. */
export const fullFormCapabilities: PatientFormCapabilities = {
  sections: sections('edit'),
  runDuplicateCheck: true,
}

/**
 * MINIMIZED (cross-org lab / pre-relationship): only the fields an MPI match/registration
 * needs. No clinical sub-records — a cross-org lab must not capture vitals/consent/allergies
 * against a patient it has no established relationship with.
 */
export const minimizedFormCapabilities: PatientFormCapabilities = {
  sections: sections('hidden', {
    identity: 'edit',
    demographics: 'edit',
    nationalId: 'edit',
    contact: 'edit',
  }),
  runDuplicateCheck: true,
}

/** CONTINUITY (cross-org, consented): read-only — the form renders as a viewer. */
export const readOnlyFormCapabilities: PatientFormCapabilities = {
  sections: sections('read'),
  runDuplicateCheck: false,
}

/** Map an access tier to form capabilities. NONE returns null (do not render the form). */
export function capabilitiesForTier(tier: AccessTier): PatientFormCapabilities | null {
  switch (tier) {
    case 'FULL':
    case 'CLINICAL':
      return fullFormCapabilities
    case 'MINIMIZED':
      return minimizedFormCapabilities
    case 'CONTINUITY':
      return readOnlyFormCapabilities
    case 'NONE':
      return null
  }
}

export function isSectionVisible(
  caps: PatientFormCapabilities,
  section: PatientFormSection,
): boolean {
  return caps.sections[section] !== 'hidden'
}

export function isSectionEditable(
  caps: PatientFormCapabilities,
  section: PatientFormSection,
): boolean {
  return caps.sections[section] === 'edit'
}
