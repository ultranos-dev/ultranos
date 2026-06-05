'use client'

import { useTranslations } from 'next-intl'

type InteractionStatus =
  | { state: 'checking' }
  | { state: 'clear' }
  | { state: 'warning'; interactions: string[] }
  | { state: 'contraindicated'; interactions: string[] }
  | { state: 'unavailable'; reason: string }

interface InteractionCheckBannerProps {
  status: InteractionStatus
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #3, if the drug interaction check fails,
 * the UI must show "Interaction check unavailable." Never default to
 * "no interactions found" on failure.
 */
export function InteractionCheckBanner({ status }: InteractionCheckBannerProps) {
  const t = useTranslations('interactionCheck')
  switch (status.state) {
    case 'checking':
      return (
        <div className="rounded-lg border border-border bg-muted p-3 text-center" data-testid="interaction-checking">
          <p className="text-sm text-muted-foreground">{t('checking')}</p>
        </div>
      )

    case 'clear':
      return (
        <div className="rounded-lg border border-success/20 bg-success/10 p-3" data-testid="interaction-clear">
          <p className="text-sm font-medium text-success">{t('clear')}</p>
        </div>
      )

    case 'warning':
      return (
        <div role="alert" className="rounded-lg border-2 border-warning/40 bg-warning/10 p-4" data-testid="interaction-warning">
          <p className="text-sm font-bold text-warning mb-2">{t('warningTitle')}</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm text-warning">&bull; {interaction}</li>
            ))}
          </ul>
        </div>
      )

    case 'contraindicated':
      return (
        <div role="alert" className="rounded-lg border-2 border-destructive bg-destructive/10 p-4" data-testid="interaction-contraindicated">
          <p className="text-sm font-bold text-destructive uppercase mb-2">{t('contraindicationTitle')}</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm font-semibold text-destructive">&bull; {interaction}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-destructive font-medium">
            {t('contraindicationBlocked')}
          </p>
        </div>
      )

    case 'unavailable':
      return (
        <div role="alert" className="rounded-lg border-2 border-warning bg-warning/10 p-4" data-testid="interaction-unavailable">
          <p className="text-sm font-bold text-warning">
            {t('unavailableTitle')}
          </p>
          <p className="text-xs text-warning mt-1">{status.reason}</p>
          <p className="text-xs font-semibold text-warning mt-2">
            {t('unavailableCaution')}
          </p>
        </div>
      )
  }
}

export type { InteractionStatus }
