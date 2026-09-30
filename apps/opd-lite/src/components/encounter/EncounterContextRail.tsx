'use client'

import { useTranslations } from 'next-intl'
import type { InteractionCheckSummary } from '@/services/interactionService'
import { Card } from '@/components/Card'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'

// The rail lives inside DetailLayout's `overflow-y-auto` aside, which clips the
// Card's *outset* ring on the inline edges (making the cards look border-less).
// `ring-inset` draws the same 0.65px border just inside the box, so it survives
// the clip and matches the main-column cards exactly.
const RAIL_CARD = 'ring-inset'

// Derive from the canonical drug-db result type (re-exported by the service the
// encounter screen uses) so this safety-critical prop can never drift from source.
export type InteractionStatus = InteractionCheckSummary['result']

const CHIP_CLASS: Record<InteractionStatus, string> = {
  CLEAR: 'bg-success/20 text-success',
  WARNING: 'bg-warning/20 text-foreground',
  BLOCKED: 'bg-destructive/20 text-destructive',
  UNAVAILABLE: 'bg-muted text-muted-foreground',
}

export interface EncounterContextRailProps {
  patient: { display: string; ageSex: string; idSlice: string }
  /** Signed patient photo URL (opaque key resolved server-side); null → initials. */
  photoUrl?: string | null
  allergies: string[]
  /**
   * Last interaction-check result, or `null` when no check has run yet (no
   * prescription entered). `null` must NOT render as UNAVAILABLE — UNAVAILABLE
   * is reserved for a check that was attempted and failed (safety rule #3), so
   * conflating "nothing to check" with "check failed" would dilute that warning.
   */
  interactionStatus: InteractionStatus | null
  activeMeds: string[]
}

export function EncounterContextRail({
  patient,
  photoUrl,
  allergies,
  interactionStatus,
  activeMeds,
}: EncounterContextRailProps) {
  const t = useTranslations('encounter')

  const statusLabel: Record<InteractionStatus, string> = {
    CLEAR: t('interactionStatusClear'),
    WARNING: t('interactionStatusWarning'),
    BLOCKED: t('interactionStatusBlocked'),
    UNAVAILABLE: t('interactionStatusUnavailable'),
  }

  return (
    <>
      {/* Patient identity */}
      <Card as="section" aria-label={t('railPatientCard')} className={RAIL_CARD}>
        <div className="flex items-center gap-3">
          <Avatar src={photoUrl} name={patient.display} size={40} />
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground" dir="auto">
              {patient.display}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {patient.ageSex} · {patient.idSlice}
            </p>
          </div>
        </div>
      </Card>

      {/* Allergies */}
      <Card as="section" aria-label={t('railAllergies')} className={RAIL_CARD}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('railAllergies')}
        </p>
        {allergies.length === 0 ? (
          <p className="text-sm font-semibold text-muted-foreground">
            {t('railNoKnownAllergies')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {allergies.map((allergen) => (
              <li
                key={allergen}
                className="rounded-full bg-destructive/20 px-2.5 py-0.5 text-xs font-bold text-destructive"
              >
                {allergen}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Interaction check */}
      <Card as="section" aria-label={t('railInteractionCheck')} className={RAIL_CARD}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('railInteractionCheck')}
        </p>
        <span
          data-testid="interaction-chip"
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
            interactionStatus === null
              ? 'bg-muted text-muted-foreground'
              : CHIP_CLASS[interactionStatus]
          }`}
        >
          {interactionStatus === null ? t('railNoneRecorded') : statusLabel[interactionStatus]}
        </span>
      </Card>

      {/* Active medications */}
      <Card as="section" aria-label={t('railActiveMeds')} className={RAIL_CARD}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('railActiveMeds')}
        </p>
        {activeMeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('railNoneRecorded')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {activeMeds.map((med) => (
              <li key={med}>{med}</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
