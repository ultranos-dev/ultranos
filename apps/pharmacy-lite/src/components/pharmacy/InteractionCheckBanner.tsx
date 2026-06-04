'use client'

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
  switch (status.state) {
    case 'checking':
      return (
        <div className="rounded-lg border border-border bg-muted p-3 text-center" data-testid="interaction-checking">
          <p className="text-sm text-muted-foreground">Checking drug interactions...</p>
        </div>
      )

    case 'clear':
      return (
        <div className="rounded-lg border border-success/20 bg-success/10 p-3" data-testid="interaction-clear">
          <p className="text-sm font-medium text-success">No known drug interactions detected.</p>
        </div>
      )

    case 'warning':
      return (
        <div role="alert" className="rounded-lg border-2 border-warning/40 bg-warning/10 p-4" data-testid="interaction-warning">
          <p className="text-sm font-bold text-warning mb-2">Drug Interaction Warning</p>
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
          <p className="text-sm font-bold text-destructive uppercase mb-2">CONTRAINDICATION DETECTED</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm font-semibold text-destructive">&bull; {interaction}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-destructive font-medium">
            Dispensing is blocked. Contact prescribing physician for alternatives.
          </p>
        </div>
      )

    case 'unavailable':
      return (
        <div role="alert" className="rounded-lg border-2 border-warning bg-warning/10 p-4" data-testid="interaction-unavailable">
          <p className="text-sm font-bold text-warning">
            Interaction check unavailable
          </p>
          <p className="text-xs text-warning mt-1">{status.reason}</p>
          <p className="text-xs font-semibold text-warning mt-2">
            Proceed with caution. Manually verify drug interactions before dispensing.
          </p>
        </div>
      )
  }
}

export type { InteractionStatus }
