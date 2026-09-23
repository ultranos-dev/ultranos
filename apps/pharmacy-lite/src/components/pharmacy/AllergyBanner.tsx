'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, CircleCheck } from '@ultranos/ui-kit/icons'

interface AllergyBannerProps {
  /**
   * Merged allergy substance list for the patient behind the scanned
   * prescription.
   *
   * SAFETY-CRITICAL semantics (Story 57.1 / C-SYS-3):
   * - `undefined` / `null` → allergy status UNKNOWN (amber warning) — the
   *   record could not be obtained. NEVER rendered as NKA.
   * - `[]`                 → confirmed No Known Allergies (neutral card).
   * - non-empty            → active allergies (red card).
   */
  allergies?: string[] | null
  patientName?: string
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #4, allergy data gets highest display
 * prominence. Renders first, in red, never collapsed, never behind a tab.
 *
 * Three states:
 * - Red card: active allergies present — lists all substances
 * - Amber card: allergy status unknown — verify verbally, override required
 * - Neutral card: confirmed no known allergies (NKA)
 *
 * Uses opd-lite default card styling (rounded-xl, backdrop-blur, ring border).
 */
export function AllergyBanner({ allergies, patientName }: AllergyBannerProps) {
  const t = useTranslations('allergyBanner')
  const hasAllergies = allergies != null && allergies.length > 0

  if (hasAllergies) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl bg-destructive/10 backdrop-blur-md p-5 shadow-card ring-[0.65px] ring-destructive/40"
        data-testid="allergy-banner"
        data-banner-state="active"
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={20} className="text-destructive shrink-0" />
          <span className="text-sm font-bold text-destructive uppercase tracking-wide">
            {patientName
              ? t('knownTitleWithName', { name: patientName })
              : t('knownTitle')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allergies.map((allergy) => (
            <span
              key={allergy}
              className="inline-flex items-center rounded-full bg-destructive/20 px-3 py-1 text-sm font-bold text-destructive"
            >
              {allergy}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // UNKNOWN state — allergy record could not be obtained. Amber warning,
  // never collapsed, explicitly distinct from NKA (CLAUDE.md Rule #3/#4).
  if (allergies == null) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl bg-warning/10 backdrop-blur-md p-5 shadow-card ring-[0.65px] ring-warning/40"
        data-testid="allergy-banner"
        data-banner-state="unknown"
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={20} className="text-warning shrink-0" />
          <span className="text-sm font-bold text-warning uppercase tracking-wide">
            {t('unknownTitle')}
          </span>
        </div>
        <p className="text-sm font-semibold text-warning">
          {t('unknownBody')}
        </p>
      </div>
    )
  }

  // NKA state — confirmed empty allergy record. Neutral card styling.
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-xl bg-muted/70 backdrop-blur-md p-5 shadow-card ring-[0.65px] ring-border"
      data-testid="allergy-banner"
      data-banner-state="nka"
    >
      <div className="flex items-center gap-2">
        <CircleCheck size={20} className="text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold text-muted-foreground">
          {t('nka')}
        </span>
      </div>
    </div>
  )
}
