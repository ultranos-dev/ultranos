export type DdiSeverity = 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'

/**
 * Heuristic severity from DrugBank interaction description text.
 * ADVISORY ONLY. Must NOT drive interaction-check blocking (CLAUDE.md rule #3)
 * until DDI_SEVERITY_REVIEWED is set true after clinical sign-off.
 */
export const DDI_SEVERITY_REVIEWED = false

const CONTRA = [/contraindicated/i]
const MAJOR = [/\bavoid\b/i, /serotonin syndrome/i, /life-threatening/i, /\bfatal\b/i, /should not be (co-?administered|combined)/i]
const MODERATE = [/may (increase|decrease) the .* activit/i, /increase(d)? (the )?risk/i, /increase(d)? .* (serum )?concentration/i, /reduce(d)? .* efficacy/i]

export function deriveDdiSeverity(description: string): DdiSeverity {
  const d = description ?? ''
  if (CONTRA.some((r) => r.test(d))) return 'CONTRAINDICATED'
  if (MAJOR.some((r) => r.test(d))) return 'MAJOR'
  if (MODERATE.some((r) => r.test(d))) return 'MODERATE'
  return 'MINOR'
}
