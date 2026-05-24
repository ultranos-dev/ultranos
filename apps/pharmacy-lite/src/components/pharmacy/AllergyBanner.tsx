'use client'

interface AllergyBannerProps {
  allergies?: string[]
  patientName?: string
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #4, allergy data gets highest display
 * prominence. Renders first, in red, never collapsed, never behind a tab.
 *
 * Two states:
 * - Red card: active allergies present — lists all substances
 * - Neutral card: no known allergies (NKA)
 *
 * Uses opd-lite default card styling (rounded-xl, backdrop-blur, ring border).
 */
export function AllergyBanner({ allergies, patientName }: AllergyBannerProps) {
  const hasAllergies = allergies && allergies.length > 0

  if (hasAllergies) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl bg-red-50/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-red-400/40"
        data-testid="allergy-banner"
        data-banner-state="active"
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

  // NKA state — neutral card styling
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-xl bg-neutral-50/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
      data-testid="allergy-banner"
      data-banner-state="nka"
    >
      <div className="flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span className="text-sm font-semibold text-neutral-600">
          No Known Allergies (NKA)
        </span>
      </div>
    </div>
  )
}
