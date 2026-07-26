'use client'

import { useTranslations } from 'next-intl'
import type { InteractionCheckSummary } from '@/services/interactionService'
import { Card } from '@/components/Card'

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
      <Card as="section" aria-label={t('railPatientCard')}>
        <p className="text-base font-bold text-foreground" dir="auto">
          {patient.display}
        </p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {patient.ageSex} · {patient.idSlice}
        </p>
      </Card>

      {/* Allergies */}
      <Card as="section" aria-label={t('railAllergies')}>
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
      <Card as="section" aria-label={t('railInteractionCheck')}>
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
      <Card as="section" aria-label={t('railActiveMeds')}>
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
