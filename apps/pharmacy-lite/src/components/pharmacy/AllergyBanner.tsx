'use client'

import { AlertTriangle, CircleCheck } from '@ultranos/ui-kit/icons'

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
          <AlertTriangle size={20} className="text-red-700 shrink-0" />
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
        <CircleCheck size={20} className="text-neutral-400 shrink-0" />
        <span className="text-sm font-semibold text-neutral-600">
          No Known Allergies (NKA)
        </span>
      </div>
    </div>
  )
}
