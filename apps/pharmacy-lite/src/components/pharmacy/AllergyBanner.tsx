'use client'

interface AllergyBannerProps {
  allergies: string[]
  patientName?: string
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #4, allergy data gets highest display
 * prominence. Renders first, in red, never collapsed, never behind a tab.
 */
export function AllergyBanner({ allergies, patientName }: AllergyBannerProps) {
  if (!allergies || allergies.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border-2 border-red-500 bg-red-50 p-4"
      data-testid="allergy-banner"
    >
      <div className="flex items-center gap-2 mb-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-700 shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-sm font-bold text-red-800 uppercase tracking-wide">
          Known Allergies{patientName ? ` \u2014 ${patientName}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {allergies.map((allergy) => (
          <span
            key={allergy}
            className="inline-flex items-center rounded-full bg-red-200 px-3 py-1 text-sm font-bold text-red-900"
          >
            {allergy}
          </span>
        ))}
      </div>
    </div>
  )
}
