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
        className="sticky top-0 z-50 bg-neutral-200 ps-4 pe-4 py-3 text-center text-sm font-semibold text-neutral-600"
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
        className="sticky top-0 z-50 bg-yellow-400 ps-4 pe-4 py-3 text-center text-sm font-bold text-yellow-900"
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
        className="sticky top-0 z-50 bg-red-600 ps-4 pe-4 py-3 text-center text-sm font-bold text-white"
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
      className="sticky top-0 z-50 bg-neutral-200 ps-4 pe-4 py-3 text-center text-sm font-semibold text-neutral-600"
      role="alert"
      aria-live="polite"
      data-testid="allergy-banner"
      data-banner-state="nka"
    >
      No Known Allergies (NKA)
    </div>
  )
}
