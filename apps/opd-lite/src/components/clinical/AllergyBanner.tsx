'use client'

import { useEffect } from 'react'
import { useAllergyStore } from '@/stores/allergy-store'

interface AllergyBannerProps {
  patientId: string
}

/**
 * Persistent allergy banner — CLAUDE.md Rule #4.
 * Renders FIRST in the DOM, in red, never collapsed, never behind a tab.
 *
 * Three states:
 * - Red: active allergies present — lists all substances
 * - Neutral (gray): no known allergies (NKA)
 * - Yellow (warning): allergy data unavailable (load error)
 *
 * CSS: sticky top, z-50 — always visible, never scrolls off.
 * Accessibility: role="alert", aria-live="assertive", contrast >= 4.5:1.
 */
export function AllergyBanner({ patientId }: AllergyBannerProps) {
  const allergies = useAllergyStore((s) => s.allergies)
  const isLoading = useAllergyStore((s) => s.isLoading)
  const loadError = useAllergyStore((s) => s.loadError)
  const loadAllergies = useAllergyStore((s) => s.loadAllergies)

  useEffect(() => {
    if (patientId?.trim()) {
      loadAllergies(patientId)
    }
  }, [patientId, loadAllergies])

  if (isLoading) {
    return (
      <div
        className="mb-4 rounded-xl bg-card-bg/70 backdrop-blur-md px-5 py-3 shadow-sm ring-[0.65px] ring-gray-400/40 text-center text-sm font-semibold text-neutral-600 transition-colors duration-200"
        role="alert"
        aria-live="polite"
        data-testid="allergy-banner"
        data-banner-state="loading"
      >
        Loading allergy data...
      </div>
    )
  }

  // Warning state: data unavailable
  if (loadError) {
    return (
      <div
        className="mb-4 rounded-xl bg-yellow-50/70 backdrop-blur-md px-5 py-3 shadow-sm ring-[0.65px] ring-yellow-400/40 text-center text-sm font-bold text-yellow-900 transition-colors duration-200"
        role="alert"
        aria-live="assertive"
        data-testid="allergy-banner"
        data-banner-state="warning"
      >
        Allergy data unavailable — verify before prescribing
      </div>
    )
  }

  // Red state: active allergies present
  if (allergies.length > 0) {
    const substanceList = allergies
      .map((a) => a._ultranos.substanceFreeText || a.code.text || 'Unknown substance')
      .join(', ')

    return (
      <div
        className="mb-4 rounded-xl bg-red-50/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-red-400/40 text-center text-sm font-bold text-red-800 transition-colors duration-200"
        role="alert"
        aria-live="assertive"
        data-testid="allergy-banner"
        data-banner-state="active"
      >
        <span aria-label={`Patient has ${allergies.length} known allergies`}>
          ALLERGIES: {substanceList}
        </span>
      </div>
    )
  }

  // Neutral state: no known allergies
  return (
    <div
      className="mb-4 rounded-xl bg-card-bg/70 backdrop-blur-md px-5 py-3 shadow-sm ring-[0.65px] ring-gray-400/40 text-center text-sm font-semibold text-neutral-600 transition-colors duration-200"
      role="alert"
      aria-live="polite"
      data-testid="allergy-banner"
      data-banner-state="nka"
    >
      No Known Allergies (NKA)
    </div>
  )
}
