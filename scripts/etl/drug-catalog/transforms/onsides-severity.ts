export type AdverseSeverity = 'mild' | 'moderate' | 'severe'

export const SEVERITY_RANK: Record<AdverseSeverity, number> = { severe: 0, moderate: 1, mild: 2 }
export const MAX_ADVERSE_EFFECTS = 50

/** OnSIDES label_section -> clinical severity. BW=Boxed Warning, WP=Warnings/Precautions, AR=Adverse Reactions. */
export function severityForSection(section: string): AdverseSeverity {
  if (section === 'BW') return 'severe'
  if (section === 'WP') return 'moderate'
  return 'mild'
}
